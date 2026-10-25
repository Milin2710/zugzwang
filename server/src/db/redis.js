import { createClient } from "redis";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

/** Create a connected node-redis client. Error events MUST be handled or node-redis crashes the process. */
export async function createRedis(name = "redis", url = config.redisUrl) {
  const client = createClient({ url });
  client.on("error", (err) => logger.error(`${name} error`, { err: err.message }));
  client.on("reconnecting", () => logger.warn(`${name} reconnecting`));
  await client.connect();
  return client;
}
