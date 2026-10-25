// Pure Elo helpers (no I/O) so they are trivial to unit-test.

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * @param {number} whiteRating rating of white at game start
 * @param {number} blackRating rating of black at game start
 * @param {"1-0"|"0-1"|"1/2-1/2"} result
 * @returns {{ whiteDelta: number, blackDelta: number }}
 */
export function eloDeltas(whiteRating, blackRating, result, { k = 32 } = {}) {
  const scoreWhite = result === "1-0" ? 1 : result === "0-1" ? 0 : 0.5;
  const expectedWhite = expectedScore(whiteRating, blackRating);
  const whiteDelta = Math.round(k * (scoreWhite - expectedWhite));
  // Zero-sum: black gains exactly what white loses.
  return { whiteDelta, blackDelta: -whiteDelta || 0 }; // || 0 avoids -0
}

export function applyFloor(rating, delta, floor = 100) {
  return Math.max(floor, rating + delta);
}
