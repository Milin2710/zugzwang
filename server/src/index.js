import http from "node:http";
import { config, assertProductionConfig } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { connectMongo, disconnectMongo } from "./db/mongo.js";
import { createRedis } from "./db/redis.js";
import { createClerkAuth } from "./auth/clerk.js";
import { createUserService } from "./services/users.js";
import { createHistoryService } from "./services/history.js";
import { createLeaderboardService } from "./services/leaderboard.js";
import { createExplorerService } from "./services/explorer.js";
import { createBotGameService } from "./services/botGames.js";
import { createPersistence } from "./services/persistence.js";
import { GameStore } from "./services/gameStore.js";
import { createGameService } from "./services/gameService.js";
import { createApp } from "./app.js";
import { createIo, createEmitter } from "./sockets/io.js";
import { registerHandlers, startSweeper } from "./sockets/handlers.js";

assertProductionConfig();

await connectMongo();
const redis = await createRedis("redis");
const adapterPub = await createRedis("redis-adapter-pub");
const adapterSub = adapterPub.duplicate();
adapterSub.on("error", (err) => logger.error("redis-adapter-sub error", { err: err.message }));
await adapterSub.connect();

const clerkAuth = createClerkAuth({ secretKey: config.clerkSecretKey, authorizedParties: config.corsOrigins, jwtKey: config.clerkJwtKey });
const users = createUserService({ clerkAuth });
const history = createHistoryService();

const store = new GameStore(redis, config.game);
const lobby = async () => ({ waiting: await store.queueSize(), playing: await store.activeGameCount() });
const app = createApp({
  config, clerkAuth, users, history, logger, lobby,
  leaderboard: createLeaderboardService(),
  explorer: createExplorerService(),
  botGames: createBotGameService(),
});
const server = http.createServer(app);
const io = createIo(server, { corsOrigins: config.corsOrigins, adapterPub, adapterSub, clerkAuth, users, logger });
const emitter = createEmitter(io);

const service = createGameService({ store, persistence: createPersistence(), emitter, config, logger });
registerHandlers(io, { service, users, emitter, logger });
const stopSweeper = startSweeper(service, config.sweepIntervalMs, logger);

server.listen(config.port, () => logger.info("server listening", { port: config.port }));

async function shutdown(signal) {
  logger.info("shutting down", { signal });
  stopSweeper();
  io.close();
  server.close();
  await Promise.allSettled([redis.quit(), adapterPub.quit(), adapterSub.quit(), disconnectMongo()]);
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => logger.error("unhandledRejection", { err }));
