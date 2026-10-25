import test from "node:test";
import assert from "node:assert/strict";
import { judge } from "../src/services/botGames.js";


test("judge: checkmate winner is the side that moved last", () => {
  const r = judge({ color: "black", moves: ["f2f3", "e7e5", "g2g4", "d8h4"] });
  assert.deepEqual([r.result, r.outcome, r.reason], ["0-1", "win", "checkmate"]);
  const w = judge({ color: "white", moves: ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"] });
  assert.deepEqual([w.result, w.outcome, w.reason], ["1-0", "win", "checkmate"]);
});

test("judge: draws are recognised by the rules, not claimed by the client", () => {
  // threefold repetition by shuffling knights
  const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"];
  const rep = judge({ color: "white", moves: shuffle });
  assert.deepEqual([rep.result, rep.outcome, rep.reason], ["1/2-1/2", "draw", "repetition"]);
});

test("judge: malformed or unfinished input is refused", () => {
  assert.throws(() => judge({ color: "white", moves: ["e2e4", "e7e5"] }), /finished/);
  assert.throws(() => judge({ color: "white", moves: ["e2e4", "zz"] }), /e2e4/);
  assert.throws(() => judge({ color: "white", moves: ["e2e5"] }), /legal/);
});

test("judge: resignation only when the game is still going", () => {
  const r = judge({ color: "white", moves: ["e2e4", "e7e5"], resigned: true });
  assert.deepEqual([r.result, r.outcome, r.reason], ["0-1", "loss", "resignation"]);
  const b = judge({ color: "black", moves: ["e2e4", "e7e5"], resigned: true });
  assert.deepEqual([b.result, b.outcome], ["1-0", "loss"]);
  // a finished game keeps its real result even if the client also says "resigned"
  const done = judge({ color: "white", moves: ["f2f3", "e7e5", "g2g4", "d8h4"], resigned: true });
  assert.deepEqual([done.reason, done.outcome], ["checkmate", "loss"]);
});
