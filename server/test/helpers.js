import { createClient } from "redis";
import { config as baseConfig } from "../src/config/index.js";
import { GameStore, P } from "../src/services/gameStore.js";
import { createGameService } from "../src/services/gameService.js";

export const REDIS_URL = process.env.TEST_REDIS_URL || "redis://localhost:6390";

export const testConfig = {
  ...baseConfig,
  game: { ...baseConfig.game, initialMs: 600_000, incrementMs: 0, firstMoveMs: 30_000, disconnectGraceMs: 30_000 },
  matchmaking: { baseWindow: 100, windowGrowthPerSec: 20 },
};

export async function connectRedis() {
  const c = createClient({ url: REDIS_URL });
  c.on("error", () => {});
  await c.connect();
  return c;
}

export async function flush(redis) {
  const keys = await redis.keys(`${P}*`);
  if (keys.length) await redis.del(keys);
}

export const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

/** Mutable fake clock shared by all service instances in a test. */
export function fakeClock(start = 1_700_000_000_000) {
  const c = { t: start, now: () => c.t, advance: (ms) => (c.t += ms) };
  return c;
}

/** Records every emitted event per user. */
export function fakeEmitter(sockets = {}) {
  const log = [];
  return {
    log,
    toUser: (user, event, payload) => log.push({ user, event, payload }),
    userSocketCount: async (user) => sockets[user] ?? 0,
    last: (user, event) => [...log].reverse().find((e) => e.user === user && e.event === event)?.payload,
    all: (user, event) => log.filter((e) => e.user === user && e.event === event).map((e) => e.payload),
  };
}

export function fakePersistence() {
  const saved = [];
  return { saved, saveFinishedGame: async (rec) => void saved.push(rec) };
}

/** Build a service "instance". Several of these on one Redis simulate several servers. */
export function makeInstance(redis, { clock, emitter = fakeEmitter(), persistence = fakePersistence(), config = testConfig } = {}) {
  const store = new GameStore(redis, config.game);
  const service = createGameService({ store, persistence, emitter, config, logger: silentLogger, now: clock?.now ?? Date.now });
  return { store, service, emitter, persistence };
}

/** Pair two players and return the game id. */
export async function startGame(inst, white = "alice", black = "bob", ratings = [1200, 1200]) {
  // joinQueue assigns colours randomly, so we play both orders until `white` is white.
  await inst.service.joinQueue({ username: white, rating: ratings[0], socketId: "s1" });
  await inst.service.joinQueue({ username: black, rating: ratings[1], socketId: "s2" });
  const snap = await inst.service.getSnapshot(white);
  return snap;
}

export async function play(service, snap, sanMoves) {
  // helper: apply [from,to] pairs alternating starting with white
  let turn = snap.turn;
  const names = { w: snap.white.username, b: snap.black.username };
  for (const [from, to, promotion] of sanMoves) {
    const res = await service.makeMove(names[turn], { from, to, promotion });
    if (!res.ok) throw new Error(`move ${from}${to} rejected: ${res.code}`);
    turn = turn === "w" ? "b" : "w";
  }
}
