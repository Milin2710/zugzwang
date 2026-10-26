import { randomUUID } from "node:crypto";
import { DEQUEUE, MATCH_OR_QUEUE, MATCH_PASS, RELEASE_LOCK } from "./lua.js";

export const P = "chess:";
const k = {
  queue: `${P}mm:queue`,
  entries: `${P}mm:entries`,
  clockDeadlines: `${P}deadlines:clock`,
  abandonDeadlines: `${P}deadlines:abandon`,
  settleFailed: `${P}settle:failed`,
  game: (id) => `${P}game:${id}`,
  moves: (id) => `${P}game:${id}:moves`,
  lock: (id) => `${P}lock:game:${id}`,
  userGame: (u) => `${P}user:${u}:game`,
};

const NUMERIC = [
  "moveCount", "whiteMs", "blackMs", "incMs", "lastMoveAt", "startedAt",
  "whiteRating", "blackRating", "drawOfferPlyW", "drawOfferPlyB",
  "disconnectW", "disconnectB", "endedAt",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * All live game state lives in Redis (never in process memory), so any server
 * instance can serve any player and a restart loses nothing.
 */
export class GameStore {
  constructor(redis, { activeTtlSec, finishedTtlSec }) {
    this.redis = redis;
    this.activeTtlSec = activeTtlSec;
    this.finishedTtlSec = finishedTtlSec;
  }

  // ---- matchmaking -------------------------------------------------------
  async matchOrQueue({ username, rating, socketId, now, baseWindow, growthPerSec, startFen, initialMs, incMs, firstMoveMs }) {
    const res = await this.redis.eval(MATCH_OR_QUEUE, {
      keys: [k.queue, k.entries, k.clockDeadlines],
      arguments: [
        P, username, String(rating), socketId, String(now), String(baseWindow), String(growthPerSec),
        randomUUID(), startFen, String(initialMs), String(incMs), String(firstMoveMs),
        String(Math.random() < 0.5 ? 0 : 1), String(this.activeTtlSec),
      ],
    });
    return { kind: res[0], gameId: res[1] };
  }

  /** Pair players who are already waiting (their accepted gap grows with time). Returns the new game ids. */
  async matchPass({ now, baseWindow, growthPerSec, startFen, initialMs, incMs, firstMoveMs, maxGames = 10 }) {
    const pairs = [];
    for (let i = 0; i < maxGames; i++) pairs.push(randomUUID(), String(Math.random() < 0.5 ? 0 : 1));
    return this.redis.eval(MATCH_PASS, {
      keys: [k.queue, k.entries, k.clockDeadlines],
      arguments: [
        P, String(now), String(baseWindow), String(growthPerSec), startFen,
        String(initialMs), String(incMs), String(firstMoveMs), String(this.activeTtlSec),
        ...pairs,
      ],
    });
  }

  async dequeue(username, socketId = "") {
    return (await this.redis.eval(DEQUEUE, { keys: [k.queue, k.entries], arguments: [username, socketId] })) === 1;
  }

  async queueSize() {
    return this.redis.zCard(k.queue);
  }

  /** Every active game has exactly one clock deadline, so its count is the number of games in progress. */
  async activeGameCount() {
    return this.redis.zCard(k.clockDeadlines);
  }

  // ---- game state --------------------------------------------------------
  async getActiveGameId(username) {
    return (await this.redis.get(k.userGame(username))) || null;
  }

  async getGame(id) {
    const h = await this.redis.hGetAll(k.game(id));
    if (!h || !h.id) return null;
    const g = { ...h };
    for (const f of NUMERIC) if (g[f] !== undefined) g[f] = Number(g[f]);
    return g;
  }

  async getMoves(id) {
    return (await this.redis.lRange(k.moves(id), 0, -1)).map((m) => JSON.parse(m));
  }

  async update(id, fields) {
    const flat = Object.fromEntries(Object.entries(fields).map(([f, v]) => [f, String(v)]));
    await this.redis.hSet(k.game(id), flat);
  }

  /** Append a move and update the hash in one atomic transaction. */
  async applyMove(id, move, fields) {
    const flat = Object.fromEntries(Object.entries(fields).map(([f, v]) => [f, String(v)]));
    await this.redis
      .multi()
      .rPush(k.moves(id), JSON.stringify(move))
      .expire(k.moves(id), this.activeTtlSec)
      .hSet(k.game(id), flat)
      .exec();
  }

  /** Mark finished, release both players, drop deadlines, keep the hash briefly for late syncs. */
  async finish(game, fields) {
    const flat = Object.fromEntries(Object.entries(fields).map(([f, v]) => [f, String(v)]));
    await this.redis
      .multi()
      .hSet(k.game(game.id), { ...flat, status: "finished" })
      .expire(k.game(game.id), this.finishedTtlSec)
      .expire(k.moves(game.id), this.finishedTtlSec)
      .del(k.userGame(game.white))
      .del(k.userGame(game.black))
      .zRem(k.clockDeadlines, game.id)
      .zRem(k.abandonDeadlines, `${game.id}:w`)
      .zRem(k.abandonDeadlines, `${game.id}:b`)
      .exec();
  }

  async recordSettleFailure(payload) {
    await this.redis.rPush(k.settleFailed, JSON.stringify(payload));
  }

  // ---- deadlines (swept by every instance) -------------------------------
  setClockDeadline(id, ts) {
    return this.redis.zAdd(k.clockDeadlines, { score: ts, value: id });
  }
  clearClockDeadline(id) {
    return this.redis.zRem(k.clockDeadlines, id);
  }
  setAbandonDeadline(id, color, ts) {
    return this.redis.zAdd(k.abandonDeadlines, { score: ts, value: `${id}:${color}` });
  }
  clearAbandonDeadline(id, color) {
    return this.redis.zRem(k.abandonDeadlines, `${id}:${color}`);
  }
  dueClock(now) {
    return this.redis.zRange(k.clockDeadlines, 0, now, { BY: "SCORE" });
  }
  async dueAbandon(now) {
    const members = await this.redis.zRange(k.abandonDeadlines, 0, now, { BY: "SCORE" });
    return members.map((m) => {
      const i = m.lastIndexOf(":");
      return { gameId: m.slice(0, i), color: m.slice(i + 1) };
    });
  }

  // ---- per-game lock -----------------------------------------------------
  /**
   * Serialise every mutation of one game, across all instances.
   * Short TTL + token-checked release means a crashed holder can't block a game forever.
   */
  async withLock(id, fn, { ttlMs = 5000, retries = 100, retryDelayMs = 20 } = {}) {
    const key = k.lock(id);
    const token = randomUUID();
    let acquired = false;
    for (let i = 0; i < retries && !acquired; i++) {
      acquired = (await this.redis.set(key, token, { NX: true, PX: ttlMs })) === "OK";
      if (!acquired) await sleep(retryDelayMs);
    }
    if (!acquired) throw new Error(`Could not lock game ${id}`);
    try {
      return await fn();
    } finally {
      await this.redis.eval(RELEASE_LOCK, { keys: [key], arguments: [token] }).catch(() => {});
    }
  }
}
