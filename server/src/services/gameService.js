import { Chess } from "chess.js";
import { applyFloor, eloDeltas } from "./rating.js";
import { canPossiblyCheckmate } from "./material.js";

const START_FEN = new Chess().fen();
const sideName = (c) => (c === "w" ? "white" : "black");

/**
 * Game rules + lifecycle. Stateless: every operation loads the game from Redis
 * under a per-game lock, so it is safe with many server instances.
 *
 * Collaborators are injected so the same code runs in production and in tests:
 *  - store:        GameStore (Redis)
 *  - persistence:  { saveFinishedGame(record) }  (Mongo)
 *  - emitter:      { toUser(username, event, payload), userSocketCount(username) }
 */
export function createGameService({ store, persistence, emitter, config, logger, now = Date.now }) {
  const { game: gc, matchmaking: mm, rating: rc } = config;

  // ---------- helpers ------------------------------------------------------
  const colorOf = (g, username) => (g.white === username ? "w" : g.black === username ? "b" : null);
  const nameOf = (g, c) => (c === "w" ? g.white : g.black);
  const other = (c) => (c === "w" ? "b" : "w");
  const msKey = (c) => (c === "w" ? "whiteMs" : "blackMs");
  const clockRunning = (g) => g.status === "active" && g.moveCount >= 2;

  /** Replay stored moves so chess.js also knows repetition + 50-move history. */
  function replay(moves) {
    const chess = new Chess();
    for (const m of moves) chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    return chess;
  }

  function remainingMs(g, c, t) {
    const base = g[msKey(c)];
    if (!clockRunning(g) || g.turn !== c) return base;
    return Math.max(0, base - (t - g.lastMoveAt));
  }

  function nextDeadline(g, t) {
    if (g.moveCount < 2) return g.lastMoveAt + gc.firstMoveMs;
    return t + remainingMs(g, g.turn, t);
  }

  function buildSnapshot(g, moves, t = now()) {
    return {
      id: g.id,
      status: g.status,
      white: { username: g.white, rating: g.whiteRating },
      black: { username: g.black, rating: g.blackRating },
      fen: g.fen,
      turn: g.turn,
      moveCount: g.moveCount,
      moves: moves.map(({ from, to, san, promotion }) => ({ from, to, san, promotion })),
      lastMove: moves.length ? { from: moves.at(-1).from, to: moves.at(-1).to } : null,
      clocks: { white: remainingMs(g, "w", t), black: remainingMs(g, "b", t) },
      clockRunning: clockRunning(g),
      incrementMs: g.incMs,
      serverTime: t,
      drawOffer: g.drawOffer ? sideName(g.drawOffer) : null,
      disconnect: {
        white: g.disconnectW || null,
        black: g.disconnectB || null,
      },
      firstMoveDeadline: g.status === "active" && g.moveCount < 2 ? g.lastMoveAt + gc.firstMoveMs : null,
      result: g.result ?? null,
      reason: g.reason ?? null,
    };
  }

  async function broadcastState(g, moves) {
    const snap = buildSnapshot(g, moves);
    await Promise.all([g.white, g.black].map((u) => emitter.toUser(u, "game:state", snap)));
  }

  async function getFresh(gameId) {
    const g = await store.getGame(gameId);
    return g;
  }

  async function withActiveGame(username, fn) {
    const gameId = await store.getActiveGameId(username);
    if (!gameId) return { ok: false, code: "NO_GAME" };
    return store.withLock(gameId, async () => {
      const g = await getFresh(gameId);
      if (!g || g.status !== "active") return { ok: false, code: "GAME_OVER" };
      const color = colorOf(g, username);
      if (!color) return { ok: false, code: "NOT_A_PLAYER" };
      return fn(g, color);
    });
  }

  // ---------- settlement ---------------------------------------------------
  /**
   * The ONLY place a game ends. Always called under the game lock, and flips
   * Redis status to "finished" first, so a duplicate trigger (resign + disconnect
   * + timeout racing) can never settle twice or double-change ratings.
   */
  async function settle(g, moves, outcome) {
    const endedAt = now();
    if (outcome.aborted) {
      await store.finish(g, { result: "aborted", reason: "aborted", endedAt });
      const fin = { ...g, status: "finished", result: "aborted", reason: "aborted" };
      await broadcastState(fin, moves);
      await Promise.all(
        [g.white, g.black].map((u) => emitter.toUser(u, "game:over", { id: g.id, result: "aborted", reason: "aborted", winner: null, ratings: null }))
      );
      return;
    }

    const { result, reason } = outcome;
    const k = rc.kFactor;
    const raw = eloDeltas(g.whiteRating, g.blackRating, result, { k });
    const whiteAfter = applyFloor(g.whiteRating, raw.whiteDelta, rc.floor);
    const blackAfter = applyFloor(g.blackRating, raw.blackDelta, rc.floor);
    const whiteDelta = whiteAfter - g.whiteRating;
    const blackDelta = blackAfter - g.blackRating;

    await store.finish(g, { result, reason, endedAt });

    const record = {
      gameId: g.id,
      white: g.white,
      black: g.black,
      whiteRating: g.whiteRating,
      blackRating: g.blackRating,
      whiteDelta,
      blackDelta,
      moves: moves.map(({ from, to, san, promotion }) => ({ from, to, san, ...(promotion ? { promotion } : {}) })),
      finalFen: g.fen,
      result,
      reason,
      startedAt: new Date(g.startedAt),
      endedAt: new Date(endedAt),
    };
    let saved = false;
    for (let attempt = 1; attempt <= 3 && !saved; attempt++) {
      try {
        await persistence.saveFinishedGame(record);
        saved = true;
      } catch (err) {
        logger.error("persist game failed", { gameId: g.id, attempt, err });
        if (attempt < 3) await new Promise((r) => setTimeout(r, 100 * attempt));
      }
    }
    if (!saved) await store.recordSettleFailure(record).catch(() => {});

    const winner = result === "1-0" ? "white" : result === "0-1" ? "black" : null;
    const over = {
      id: g.id,
      result,
      reason,
      winner,
      ratings: {
        white: { before: g.whiteRating, after: whiteAfter, delta: whiteDelta },
        black: { before: g.blackRating, after: blackAfter, delta: blackDelta },
      },
    };
    const fin = { ...g, status: "finished", result, reason };
    await broadcastState(fin, moves);
    await Promise.all([g.white, g.black].map((u) => emitter.toUser(u, "game:over", over)));
  }

  const resultFor = (winnerColor) => (winnerColor === "w" ? "1-0" : "0-1");

  function detectOutcome(chess, mover) {
    if (chess.isCheckmate()) return { result: resultFor(mover), reason: "checkmate" };
    if (chess.isStalemate()) return { result: "1/2-1/2", reason: "stalemate" };
    if (chess.isInsufficientMaterial()) return { result: "1/2-1/2", reason: "insufficient" };
    if (chess.isThreefoldRepetition()) return { result: "1/2-1/2", reason: "repetition" };
    if (chess.isDrawByFiftyMoves()) return { result: "1/2-1/2", reason: "fifty-move" };
    return null;
  }

  // ---------- matchmaking --------------------------------------------------
  async function joinQueue({ username, rating, socketId }) {
    const res = await store.matchOrQueue({
      username, rating, socketId, now: now(),
      baseWindow: mm.baseWindow, growthPerSec: mm.windowGrowthPerSec,
      startFen: START_FEN, initialMs: gc.initialMs, incMs: gc.incrementMs, firstMoveMs: gc.firstMoveMs,
    });
    if (res.kind === "matched") await announce(res.gameId);
    return { status: res.kind, gameId: res.gameId };
  }

  async function announce(gameId) {
    const g = await getFresh(gameId);
    if (!g) return;
    await broadcastState(g, await store.getMoves(gameId));
  }

  /**
   * Pair people who are already waiting. A new joiner is matched on the spot by joinQueue, but the
   * accepted rating gap keeps growing while someone waits, so the sweeper calls this every tick.
   */
  async function matchPass() {
    const ids = await store.matchPass({
      now: now(),
      baseWindow: mm.baseWindow, growthPerSec: mm.windowGrowthPerSec,
      startFen: START_FEN, initialMs: gc.initialMs, incMs: gc.incrementMs, firstMoveMs: gc.firstMoveMs,
    });
    for (const id of ids) await announce(id);
    return ids.length;
  }

  async function leaveQueue(username, socketId) {
    return store.dequeue(username, socketId);
  }

  // ---------- player actions ----------------------------------------------
  async function makeMove(username, { from, to, promotion }) {
    return withActiveGame(username, async (g, color) => {
      if (g.turn !== color) return { ok: false, code: "NOT_YOUR_TURN" };
      const t = now();
      const moves = await store.getMoves(g.id);

      // Flag fell before the move arrived -> the move does not count.
      if (clockRunning(g) && t - g.lastMoveAt >= g[msKey(color)]) {
        await settleTimeout(g, moves, color);
        return { ok: false, code: "TIMEOUT" };
      }

      const chess = replay(moves);
      let played;
      try {
        played = chess.move({ from, to, promotion });
      } catch {
        return { ok: false, code: "ILLEGAL_MOVE" };
      }

      const move = { from: played.from, to: played.to, san: played.san, ...(played.promotion ? { promotion: played.promotion } : {}) };
      const fields = {
        fen: chess.fen(),
        turn: chess.turn(),
        moveCount: g.moveCount + 1,
        lastMoveAt: t,
        drawOffer: "", // a move implicitly declines a pending offer
      };
      if (clockRunning(g)) fields[msKey(color)] = g[msKey(color)] - (t - g.lastMoveAt) + g.incMs;
      await store.applyMove(g.id, move, fields);

      const updated = { ...g, ...fields };
      const allMoves = [...moves, move];
      const outcome = detectOutcome(chess, color);
      if (outcome) {
        await settle(updated, allMoves, outcome);
      } else {
        await store.setClockDeadline(g.id, nextDeadline(updated, t));
        await broadcastState(updated, allMoves);
      }
      return { ok: true };
    });
  }

  async function resign(username) {
    return withActiveGame(username, async (g, color) => {
      const moves = await store.getMoves(g.id);
      // Resigning a game that barely started is an abort, not a rated loss.
      if (g.moveCount < 2) await settle(g, moves, { aborted: true });
      else await settle(g, moves, { result: resultFor(other(color)), reason: "resignation" });
      return { ok: true };
    });
  }

  async function offerDraw(username) {
    return withActiveGame(username, async (g, color) => {
      if (g.moveCount < 2) return { ok: false, code: "TOO_EARLY" };
      const moves = await store.getMoves(g.id);
      if (g.drawOffer === other(color)) {
        await settle(g, moves, { result: "1/2-1/2", reason: "agreement" }); // both want it
        return { ok: true };
      }
      if (g.drawOffer === color) return { ok: true };
      const plyKey = color === "w" ? "drawOfferPlyW" : "drawOfferPlyB";
      if (g[plyKey] === g.moveCount) return { ok: false, code: "ALREADY_OFFERED" };
      const fields = { drawOffer: color, [plyKey]: g.moveCount };
      await store.update(g.id, fields);
      await broadcastState({ ...g, ...fields }, moves);
      return { ok: true };
    });
  }

  async function acceptDraw(username) {
    return withActiveGame(username, async (g, color) => {
      if (g.drawOffer !== other(color)) return { ok: false, code: "NO_OFFER" };
      await settle(g, await store.getMoves(g.id), { result: "1/2-1/2", reason: "agreement" });
      return { ok: true };
    });
  }

  async function declineDraw(username) {
    return withActiveGame(username, async (g, color) => {
      if (g.drawOffer !== other(color)) return { ok: false, code: "NO_OFFER" };
      await store.update(g.id, { drawOffer: "" });
      await broadcastState({ ...g, drawOffer: "" }, await store.getMoves(g.id));
      return { ok: true };
    });
  }

  // ---------- connection lifecycle ----------------------------------------
  /** Called when a player has no sockets left. Starts the forfeit countdown. */
  async function onUserOffline(username) {
    await withActiveGame(username, async (g, color) => {
      const field = color === "w" ? "disconnectW" : "disconnectB";
      if (g[field]) return { ok: true };
      const deadline = now() + gc.disconnectGraceMs;
      await store.update(g.id, { [field]: deadline });
      await store.setAbandonDeadline(g.id, color, deadline);
      await broadcastState({ ...g, [field]: deadline }, await store.getMoves(g.id));
      return { ok: true };
    });
  }

  /** Called when a player's socket (re)connects. Returns the snapshot to resume, or null. */
  async function onUserOnline(username) {
    const gameId = await store.getActiveGameId(username);
    if (!gameId) return null;
    return store.withLock(gameId, async () => {
      const g = await getFresh(gameId);
      if (!g || g.status !== "active") return null;
      const color = colorOf(g, username);
      if (!color) return null;
      const field = color === "w" ? "disconnectW" : "disconnectB";
      const moves = await store.getMoves(gameId);
      if (g[field]) {
        await store.update(gameId, { [field]: 0 });
        await store.clearAbandonDeadline(gameId, color);
        const updated = { ...g, [field]: 0 };
        await broadcastState(updated, moves); // tells the opponent we're back
        return buildSnapshot(updated, moves);
      }
      return buildSnapshot(g, moves);
    });
  }

  async function getSnapshot(username) {
    const gameId = await store.getActiveGameId(username);
    if (!gameId) return null;
    const g = await getFresh(gameId);
    if (!g || g.status !== "active") return null;
    return buildSnapshot(g, await store.getMoves(gameId));
  }

  // ---------- deadlines (called by the sweeper on every instance) ----------
  async function settleTimeout(g, moves, loserColor) {
    // Running out of time only loses if the OTHER side could still deliver mate (FIDE 6.9);
    // otherwise it is a draw ("timeout vs insufficient material").
    const chess = replay(moves);
    const winner = other(loserColor);
    if (!canPossiblyCheckmate(chess, winner)) return settle(g, moves, { result: "1/2-1/2", reason: "timeout-insufficient" });
    return settle(g, moves, { result: resultFor(winner), reason: "timeout" });
  }

  async function handleClockDeadline(gameId) {
    return store.withLock(gameId, async () => {
      const g = await getFresh(gameId);
      if (!g || g.status !== "active") return store.clearClockDeadline(gameId);
      const t = now();
      const moves = await store.getMoves(gameId);
      if (g.moveCount < 2) {
        if (t >= g.lastMoveAt + gc.firstMoveMs) return settle(g, moves, { aborted: true });
      } else if (t - g.lastMoveAt >= g[msKey(g.turn)]) {
        return settleTimeout(g, moves, g.turn);
      }
      return store.setClockDeadline(gameId, nextDeadline(g, t)); // woke early; re-arm
    });
  }

  async function handleAbandonDeadline(gameId, color) {
    return store.withLock(gameId, async () => {
      const g = await getFresh(gameId);
      const field = color === "w" ? "disconnectW" : "disconnectB";
      if (!g || g.status !== "active" || !g[field]) return store.clearAbandonDeadline(gameId, color);
      if (now() < g[field]) return store.setAbandonDeadline(gameId, color, g[field]);
      // Reconnected on another instance but the flag wasn't cleared yet?
      if ((await emitter.userSocketCount(nameOf(g, color))) > 0) {
        await store.update(gameId, { [field]: 0 });
        return store.clearAbandonDeadline(gameId, color);
      }
      const moves = await store.getMoves(gameId);
      if (g.moveCount < 2) return settle(g, moves, { aborted: true });
      return settle(g, moves, { result: resultFor(other(color)), reason: "abandoned" });
    });
  }

  /** One pass over everything that is due. Safe to run concurrently on every instance. */
  async function sweep() {
    await matchPass().catch((err) => logger.error("matchmaking pass failed", { err }));
    const t = now();
    for (const id of await store.dueClock(t)) {
      await handleClockDeadline(id).catch((err) => logger.error("clock deadline failed", { gameId: id, err }));
    }
    for (const { gameId, color } of await store.dueAbandon(t)) {
      await handleAbandonDeadline(gameId, color).catch((err) => logger.error("abandon deadline failed", { gameId, err }));
    }
  }

  return {
    joinQueue, leaveQueue, matchPass,
    makeMove, resign, offerDraw, acceptDraw, declineDraw,
    onUserOffline, onUserOnline, getSnapshot,
    handleClockDeadline, handleAbandonDeadline, sweep,
  };
}
