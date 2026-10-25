import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { canPossiblyCheckmate } from "../src/services/material.js";
import { explorerOps, positionKey, MAX_PLY } from "../src/services/explorer.js";

const can = (fen, color) => canPossiblyCheckmate(new Chess(fen, { skipValidation: true }), color);

test("timeout vs insufficient material: who could still mate?", () => {
  // bare kings
  assert.equal(can("4k3/8/8/8/8/8/8/4K3 w - - 0 1", "w"), false);
  // lone knight or bishop vs bare king
  assert.equal(can("4k3/8/8/8/8/8/8/3NK3 w - - 0 1", "w"), false);
  assert.equal(can("4k3/8/8/8/8/8/8/3BK3 w - - 0 1", "w"), false);
  // lone knight vs king+pawn: the pawn can block, so mate is possible in theory
  assert.equal(can("4k3/p7/8/8/8/8/8/3NK3 w - - 0 1", "w"), true);
  // any pawn, rook or queen can always mate in theory
  assert.equal(can("4k3/8/8/8/8/8/P7/4K3 w - - 0 1", "w"), true);
  assert.equal(can("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "w"), true);
  // the side WITHOUT material can't mate, even if the opponent has a queen
  assert.equal(can("4k3/8/8/8/8/8/8/Q3K3 w - - 0 1", "b"), false);
  // two knights: mate is possible with cooperation, so flagging still loses
  assert.equal(can("4k3/8/8/8/8/8/8/2NNK3 w - - 0 1", "w"), true);
});

test("bishops: same colour complex can't mate, opposite colours can", () => {
  // c1 and f8 are both dark squares; c1 and c8... use known colours: c1 dark, f1 light
  assert.equal(can("5b1k/8/8/8/8/8/8/2B1K3 w - - 0 1", "w"), false); // dark vs dark bishop
  assert.equal(can("2b4k/8/8/8/8/8/8/2B1K3 w - - 0 1", "w"), true); // c8 is light, c1 is dark
  assert.equal(can("7k/8/8/8/8/8/8/2B2BK1 w - - 0 1", "w"), true); // c1 dark + f1 light
  assert.equal(can("7k/8/8/8/8/8/8/1B3B1K w - - 0 1", "w"), false); // b1 light? both on same complex
});

test("explorer ops: one upsert per ply, keyed by position, counting the result for the right side", () => {
  const moves = [{ from: "e2", to: "e4" }, { from: "e7", to: "e5" }, { from: "g1", to: "f3" }];
  const ops = explorerOps(moves, "0-1");
  assert.equal(ops.length, 3);
  assert.deepEqual(ops[0].updateOne.filter, { pos: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -", san: "e4" });
  assert.deepEqual(ops[0].updateOne.update, { $inc: { games: 1, black: 1 } });
  assert.equal(ops[0].updateOne.upsert, true);
  assert.equal(ops[2].updateOne.filter.san, "Nf3");
  assert.deepEqual(explorerOps(moves, "1-0")[0].updateOne.update.$inc, { games: 1, white: 1 });
  assert.deepEqual(explorerOps(moves, "1/2-1/2")[0].updateOne.update.$inc, { games: 1, draws: 1 });
});

test("explorer: transpositions share a position key; only the opening is indexed", () => {
  const key = (seq) => {
    const c = new Chess();
    seq.forEach(([from, to]) => c.move({ from, to }));
    return positionKey(c.fen());
  };
  const a = key([["g1", "f3"], ["g8", "f6"], ["b1", "c3"], ["b8", "c6"]]);
  const b = key([["b1", "c3"], ["b8", "c6"], ["g1", "f3"], ["g8", "f6"]]);
  assert.equal(a, b);
  assert.equal(a.split(" ").length, 4); // no half-move / full-move counters

  const shuffle = Array.from({ length: 14 }, () => [["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"]]).flat().map(([from, to]) => ({ from, to }));
  assert.ok(shuffle.length > MAX_PLY);
  assert.equal(explorerOps(shuffle, "1-0").length, MAX_PLY);
});
