import test from "node:test";
import assert from "node:assert/strict";
import { eloDeltas, expectedScore, applyFloor } from "../src/services/rating.js";

test("equal ratings: winner gains K/2, loser loses K/2", () => {
  assert.deepEqual(eloDeltas(1200, 1200, "1-0"), { whiteDelta: 16, blackDelta: -16 });
  assert.deepEqual(eloDeltas(1200, 1200, "0-1"), { whiteDelta: -16, blackDelta: 16 });
});

test("equal ratings draw changes nothing", () => {
  const d = eloDeltas(1500, 1500, "1/2-1/2");
  assert.equal(d.whiteDelta + 0, 0);
});

test("beating a stronger player pays more than beating a weaker one", () => {
  const upset = eloDeltas(1200, 1600, "1-0").whiteDelta;
  const expected = eloDeltas(1600, 1200, "1-0").whiteDelta;
  assert.ok(upset > expected, `${upset} should be > ${expected}`);
  assert.ok(upset > 16 && expected < 16);
});

test("zero-sum and symmetrical", () => {
  const { whiteDelta, blackDelta } = eloDeltas(1337, 1488, "0-1");
  assert.equal(whiteDelta + blackDelta, 0);
});

test("expected score sanity", () => {
  assert.equal(expectedScore(1200, 1200), 0.5);
  assert.ok(Math.abs(expectedScore(1600, 1200) - 0.909) < 0.001);
});

test("rating never drops below the floor", () => {
  assert.equal(applyFloor(105, -16, 100), 100);
  assert.equal(applyFloor(1200, -16, 100), 1184);
});
