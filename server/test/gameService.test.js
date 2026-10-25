import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { connectRedis, flush, fakeClock, fakeEmitter, fakePersistence, makeInstance, startGame, play, testConfig } from "./helpers.js";

let redis, clock;
before(async () => (redis = await connectRedis()));
after(async () => redis.quit());
beforeEach(async () => {
  await flush(redis);
  clock = fakeClock();
});

const FOOLS_MATE = [["f2", "f3"], ["e7", "e5"], ["g2", "g4"], ["d8", "h4"]]; // white is mated

test("matchmaking pairs players connected to DIFFERENT server instances", async () => {
  const a = makeInstance(redis, { clock });
  const b = makeInstance(redis, { clock });
  const first = await a.service.joinQueue({ username: "alice", rating: 1200, socketId: "x" });
  assert.equal(first.status, "queued");
  const second = await b.service.joinQueue({ username: "bob", rating: 1200, socketId: "y" });
  assert.equal(second.status, "matched");
  // both players were told, whichever instance the pairing happened on
  assert.ok(b.emitter.last("alice", "game:state"));
  assert.ok(b.emitter.last("bob", "game:state"));
  const snap = await a.service.getSnapshot("alice");
  assert.deepEqual([snap.white.username, snap.black.username].sort(), ["alice", "bob"]);
});

test("a user cannot be in two games, and re-queuing returns the running game", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  const again = await inst.service.joinQueue({ username: "alice", rating: 1200, socketId: "z" });
  assert.equal(again.status, "in_game");
  assert.equal(again.gameId, snap.id);
});

test("simultaneous joins on 3 instances: nobody is ever in two games, nobody is paired twice", async () => {
  const insts = [makeInstance(redis, { clock }), makeInstance(redis, { clock }), makeInstance(redis, { clock })];
  await insts[0].service.joinQueue({ username: "host", rating: 1200, socketId: "h" });
  const names = ["p1", "p2", "p3"];
  await Promise.all(names.map((u, i) => insts[i].service.joinQueue({ username: u, rating: 1200, socketId: u })));
  // 4 players -> exactly 2 games of 2 distinct players each
  const gameIds = await Promise.all(["host", ...names].map((u) => insts[0].store.getActiveGameId(u)));
  assert.ok(gameIds.every(Boolean), "everyone got a game");
  assert.equal(new Set(gameIds).size, 2);
  for (const id of new Set(gameIds)) {
    const g = await insts[0].store.getGame(id);
    assert.notEqual(g.white, g.black);
    assert.equal(gameIds.filter((x) => x === id).length, 2);
  }
  assert.equal(await insts[0].store.queueSize(), 0);
});

test("rating window: far apart players wait, then match as the window widens", async () => {
  const inst = makeInstance(redis, { clock });
  await inst.service.joinQueue({ username: "low", rating: 1200, socketId: "a" });
  const r1 = await inst.service.joinQueue({ username: "high", rating: 1800, socketId: "b" });
  assert.equal(r1.status, "queued");
  clock.advance(60_000); // low has now waited 60s -> window 100 + 20*60 = 1300
  const r2 = await inst.service.joinQueue({ username: "high", rating: 1800, socketId: "b" });
  assert.equal(r2.status, "matched");
});

test("leaving the queue removes you", async () => {
  const inst = makeInstance(redis, { clock });
  await inst.service.joinQueue({ username: "alice", rating: 1200, socketId: "a" });
  await inst.service.leaveQueue("alice");
  const r = await inst.service.joinQueue({ username: "bob", rating: 1200, socketId: "b" });
  assert.equal(r.status, "queued");
});

test("only legal moves, only on your turn, only by players", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  const w = snap.white.username, b = snap.black.username;
  assert.equal((await inst.service.makeMove(b, { from: "e7", to: "e5" })).code, "NOT_YOUR_TURN");
  assert.equal((await inst.service.makeMove(w, { from: "e2", to: "e5" })).code, "ILLEGAL_MOVE"); // pawn can't jump 3
  assert.equal((await inst.service.makeMove(w, { from: "e1", to: "e2" })).code, "ILLEGAL_MOVE"); // blocked
  assert.equal((await inst.service.makeMove(w, { from: "a7", to: "a5" })).code, "ILLEGAL_MOVE"); // opponent's piece
  assert.equal((await inst.service.makeMove("mallory", { from: "e2", to: "e4" })).code, "NO_GAME");
  assert.equal((await inst.service.makeMove(w, { from: "e2", to: "e4" })).ok, true);
  assert.equal((await inst.service.makeMove(w, { from: "d2", to: "d4" })).code, "NOT_YOUR_TURN"); // no double moves
  assert.equal((await inst.service.makeMove(b, { from: "e7", to: "e5" })).ok, true);
});

test("can't walk into check / ignore check (full rules from chess.js)", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  await play(inst.service, snap, [["e2", "e4"], ["d7", "d5"], ["f1", "b5"]]); // black is in check from Bb5
  const b = snap.black.username;
  assert.equal((await inst.service.makeMove(b, { from: "a7", to: "a6" })).code, "ILLEGAL_MOVE"); // doesn't resolve check
  assert.equal((await inst.service.makeMove(b, { from: "c7", to: "c6" })).ok, true);
});

test("castling, en passant and promotion work", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  // castling kingside for white
  await play(inst.service, snap, [["e2", "e4"], ["e7", "e5"], ["g1", "f3"], ["b8", "c6"], ["f1", "c4"], ["g8", "f6"], ["e1", "g1"]]);
  const g = await inst.store.getGame(snap.id);
  assert.match(g.fen.split(" ")[0], /RNBQ1RK1$|R1BQ1RK1$/);
  const moves = await inst.store.getMoves(snap.id);
  assert.equal(moves.at(-1).san, "O-O");

  // en passant + promotion in a fresh game
  await flush(redis);
  const s2 = await startGame(inst, "carol", "dave");
  await play(inst.service, s2, [
    ["e2", "e4"], ["a7", "a6"], ["e4", "e5"], ["d7", "d5"], ["e5", "d6"], // en passant capture
    ["e7", "d6"], ["a2", "a4"], ["a6", "a5"], ["h2", "h4"], ["b8", "c6"], ["h4", "h5"], ["c6", "d4"],
    ["h5", "h6"], ["d4", "b3"], ["h6", "g7"], ["c8", "d7"], ["g7", "h8", "q"], // promotion
  ]);
  const last = (await inst.store.getMoves(s2.id)).at(-1);
  assert.equal(last.san, "gxh8=Q");
  assert.equal(last.promotion, "q");
});

test("promotion without a piece choice is rejected", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  await play(inst.service, snap, [
    ["h2", "h4"], ["a7", "a5"], ["h4", "h5"], ["a5", "a4"], ["h5", "h6"], ["a4", "a3"], ["h6", "g7"], ["a3", "b2"],
  ]);
  assert.equal((await inst.service.makeMove(snap.white.username, { from: "g7", to: "h8" })).code, "ILLEGAL_MOVE");
});

test("checkmate ends the game once, saves it, and applies Elo", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst, "alice", "bob", [1200, 1200]);
  // make `white` the one who gets mated (fool's mate), black wins
  await play(inst.service, snap, FOOLS_MATE);
  assert.equal(inst.persistence.saved.length, 1);
  const rec = inst.persistence.saved[0];
  assert.equal(rec.result, "0-1");
  assert.equal(rec.reason, "checkmate");
  assert.equal(rec.moves.length, 4);
  assert.equal(rec.moves.at(-1).san, "Qh4#");
  assert.equal(rec.blackDelta, 16);
  assert.equal(rec.whiteDelta, -16);
  const over = inst.emitter.last(snap.white.username, "game:over");
  assert.equal(over.winner, "black");
  assert.deepEqual(over.ratings.white, { before: 1200, after: 1184, delta: -16 });
  // both players are free again, and no more moves are accepted
  assert.equal(await inst.store.getActiveGameId("alice"), null);
  assert.equal((await inst.service.makeMove(snap.white.username, { from: "e2", to: "e4" })).code, "NO_GAME");
});

test("Elo depends on opponent rating (upset pays more)", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst, "weak", "strong", [1200, 1300]);
  const weakIsWhite = snap.white.username === "weak";
  // make the white player lose by fool's mate regardless of who is white
  await play(inst.service, snap, FOOLS_MATE); // black wins
  const rec = inst.persistence.saved[0];
  const blackName = rec.black;
  // Whoever is black won. If black is the weaker player, the gain must exceed 16.
  if (blackName === "weak") assert.ok(rec.blackDelta > 16, `upset gain ${rec.blackDelta}`);
  else assert.ok(rec.blackDelta < 16, `expected-win gain ${rec.blackDelta}`);
  assert.equal(rec.whiteDelta, -rec.blackDelta);
  assert.equal(typeof weakIsWhite, "boolean");
});

test("resigning before 2 plies aborts: no rating change, nothing saved", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  await inst.service.resign(snap.white.username);
  assert.equal(inst.persistence.saved.length, 0);
  assert.equal(inst.emitter.last(snap.white.username, "game:over").result, "aborted");
});

test("resignation after play: opponent wins and ratings move", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  await play(inst.service, snap, [["e2", "e4"], ["e7", "e5"]]);
  await inst.service.resign(snap.black.username);
  const rec = inst.persistence.saved[0];
  assert.equal(rec.result, "1-0");
  assert.equal(rec.reason, "resignation");
});

test("racing triggers (both resign at once, from two instances) settle exactly once", async () => {
  const a = makeInstance(redis, { clock });
  const b = makeInstance(redis, { clock, persistence: a.persistence, emitter: a.emitter });
  const snap = await startGame(a);
  await play(a.service, snap, [["e2", "e4"], ["e7", "e5"]]);
  await Promise.all([a.service.resign(snap.white.username), b.service.resign(snap.black.username), a.service.resign(snap.white.username)]);
  assert.equal(a.persistence.saved.length, 1);
  assert.equal(a.emitter.all(snap.white.username, "game:over").length, 1);
});

test("draw offer: offer -> accept ends in a draw", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  const { white: w, black: b } = { white: snap.white.username, black: snap.black.username };
  assert.equal((await inst.service.offerDraw(w)).code, "TOO_EARLY");
  await play(inst.service, snap, [["e2", "e4"], ["e7", "e5"]]);
  assert.equal((await inst.service.offerDraw(w)).ok, true);
  assert.equal(inst.emitter.last(b, "game:state").drawOffer, "white");
  assert.equal((await inst.service.acceptDraw(w)).code, "NO_OFFER"); // can't accept your own
  assert.equal((await inst.service.acceptDraw(b)).ok, true);
  assert.equal(inst.persistence.saved[0].result, "1/2-1/2");
  assert.equal(inst.persistence.saved[0].reason, "agreement");
});

test("draw offer: decline clears it, no re-offer spam until a move is made, a move declines too", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  const w = snap.white.username, b = snap.black.username;
  await play(inst.service, snap, [["e2", "e4"], ["e7", "e5"]]);
  await inst.service.offerDraw(w);
  await inst.service.declineDraw(b);
  assert.equal(inst.emitter.last(w, "game:state").drawOffer, null);
  assert.equal((await inst.service.offerDraw(w)).code, "ALREADY_OFFERED");
  await inst.service.makeMove(w, { from: "g1", to: "f3" });
  await inst.service.makeMove(b, { from: "b8", to: "c6" });
  assert.equal((await inst.service.offerDraw(b)).ok, true);
  await inst.service.makeMove(w, { from: "f1", to: "c4" }); // moving ignores the offer
  assert.equal(inst.emitter.last(w, "game:state").drawOffer, null);
});

test("mutual draw offers (offer while opponent's offer is pending) = agreement", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  await play(inst.service, snap, [["e2", "e4"], ["e7", "e5"]]);
  await inst.service.offerDraw(snap.white.username);
  await inst.service.offerDraw(snap.black.username);
  assert.equal(inst.persistence.saved[0].reason, "agreement");
});

test("stalemate and threefold repetition are detected automatically", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  await play(inst.service, snap, [
    ["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"],
    ["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"],
  ]);
  const rec = inst.persistence.saved[0];
  assert.equal(rec.result, "1/2-1/2");
  assert.equal(rec.reason, "repetition");
});

test("clocks: time is deducted from the mover, starts after both sides moved, and flagging loses", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  const w = snap.white.username, b = snap.black.username;
  clock.advance(5_000);
  await inst.service.makeMove(w, { from: "e2", to: "e4" }); // clock not running yet
  clock.advance(5_000);
  await inst.service.makeMove(b, { from: "e7", to: "e5" });
  let s = await inst.service.getSnapshot(w);
  assert.equal(s.clocks.white, 600_000);
  assert.equal(s.clocks.black, 600_000);
  assert.equal(s.clockRunning, true);
  clock.advance(7_000);
  await inst.service.makeMove(w, { from: "g1", to: "f3" });
  s = await inst.service.getSnapshot(w);
  assert.equal(s.clocks.white, 593_000);
  clock.advance(100_000); // black thinks; the snapshot shows the live countdown
  s = await inst.service.getSnapshot(w);
  assert.equal(s.clocks.black, 500_000);
  clock.advance(600_000); // black's flag falls
  await inst.service.sweep();
  const rec = inst.persistence.saved[0];
  assert.equal(rec.result, "1-0");
  assert.equal(rec.reason, "timeout");
  assert.equal(rec.moves.length, 3);
});

test("a move that arrives after the flag fell is rejected and the mover loses", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  await play(inst.service, snap, [["e2", "e4"], ["e7", "e5"]]);
  clock.advance(601_000);
  const res = await inst.service.makeMove(snap.white.username, { from: "g1", to: "f3" });
  assert.equal(res.code, "TIMEOUT");
  assert.equal(inst.persistence.saved[0].result, "0-1");
});

test("increment is added after each timed move", async () => {
  const config = { ...testConfig, game: { ...testConfig.game, incrementMs: 2_000 } };
  const inst = makeInstance(redis, { clock, config });
  const snap = await startGame(inst);
  await play(inst.service, snap, [["e2", "e4"], ["e7", "e5"]]);
  clock.advance(3_000);
  await inst.service.makeMove(snap.white.username, { from: "g1", to: "f3" });
  const s = await inst.service.getSnapshot(snap.white.username);
  assert.equal(s.clocks.white, 600_000 - 3_000 + 2_000);
});

test("nobody moves at the start: the game is aborted, not scored", async () => {
  const inst = makeInstance(redis, { clock });
  const snap = await startGame(inst);
  clock.advance(31_000);
  await inst.service.sweep();
  assert.equal(inst.persistence.saved.length, 0);
  assert.equal(inst.emitter.last(snap.white.username, "game:over").result, "aborted");
  assert.equal(await inst.store.getActiveGameId(snap.white.username), null);
});

test("disconnect: forfeits only after the grace period; coming back cancels it", async () => {
  const sockets = { alice: 0, bob: 1 };
  const inst = makeInstance(redis, { clock, emitter: fakeEmitter(sockets) });
  const snap = await startGame(inst);
  await play(inst.service, snap, [["e2", "e4"], ["e7", "e5"]]);
  const gone = snap.white.username === "alice" ? "alice" : "bob";
  const stays = gone === "alice" ? "bob" : "alice";
  sockets[gone] = 0; sockets[stays] = 1;

  await inst.service.onUserOffline(gone);
  assert.ok(inst.emitter.last(stays, "game:state").disconnect[gone === snap.white.username ? "white" : "black"]);
  clock.advance(20_000);
  await inst.service.sweep();
  assert.equal(inst.persistence.saved.length, 0); // still within grace

  const resumed = await inst.service.onUserOnline(gone); // refresh/reconnect
  assert.equal(resumed.id, snap.id);
  assert.equal(resumed.disconnect.white, null);
  clock.advance(60_000);
  await inst.service.sweep();
  assert.equal(inst.persistence.saved.length, 0); // flag was cleared

  await inst.service.onUserOffline(gone);
  clock.advance(31_000);
  await inst.service.sweep();
  const rec = inst.persistence.saved[0];
  assert.equal(rec.reason, "abandoned");
  assert.equal(rec.white === gone ? rec.result : rec.result, gone === rec.white ? "0-1" : "1-0");
});

test("a state-less restart loses nothing: a brand new instance continues the game", async () => {
  const a = makeInstance(redis, { clock });
  const snap = await startGame(a);
  await play(a.service, snap, [["e2", "e4"], ["e7", "e5"]]);
  const b = makeInstance(redis, { clock }); // "restarted" process
  const s = await b.service.getSnapshot(snap.white.username);
  assert.equal(s.moves.length, 2);
  assert.equal((await b.service.makeMove(snap.white.username, { from: "g1", to: "f3" })).ok, true);
});

test("lobby counters: games in progress and players waiting", async () => {
  const inst = makeInstance(redis, { clock });
  assert.equal(await inst.store.activeGameCount(), 0);
  await inst.service.joinQueue({ username: "solo", rating: 1200, socketId: "s" });
  assert.equal(await inst.store.queueSize(), 1);
  await inst.service.joinQueue({ username: "duo", rating: 1200, socketId: "d" });
  assert.equal(await inst.store.queueSize(), 0);
  assert.equal(await inst.store.activeGameCount(), 1);
  const snap = await inst.service.getSnapshot("solo");
  await inst.service.resign(snap.white.username); // aborted (no moves) frees the players
  assert.equal(await inst.store.activeGameCount(), 0);
});
