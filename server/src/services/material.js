/**
 * "Can this side still deliver checkmate by SOME series of legal moves?"
 * Used when the opponent runs out of time (FIDE 6.9): if not, the game is a draw, not a win on time.
 * Pure function over a chess.js instance so it is easy to test.
 */
export function canPossiblyCheckmate(chess, color) {
  const mine = { p: 0, n: 0, b: 0, r: 0, q: 0, darkBishops: 0, lightBishops: 0 };
  const theirs = { other: 0, bishopsOnly: true, darkBishops: 0, lightBishops: 0 };
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (!sq || sq.type === "k") continue;
      const lightSquare = (r + f) % 2 === 0;
      if (sq.color === color) {
        mine[sq.type]++;
        if (sq.type === "b") lightSquare ? mine.lightBishops++ : mine.darkBishops++;
      } else {
        theirs.other++;
        if (sq.type !== "b") theirs.bishopsOnly = false;
        else lightSquare ? theirs.lightBishops++ : theirs.darkBishops++;
      }
    }
  }
  if (mine.p || mine.r || mine.q) return true; // can always (in theory) mate
  const minors = mine.n + mine.b;
  if (minors === 0) return false; // bare king
  if (minors === 1) {
    if (theirs.other === 0) return false; // K+N or K+B vs bare king
    if (mine.b === 1) {
      // K+B vs K+B on the same colour complex can never mate; opposite colours can (with help)
      const myDark = mine.darkBishops === 1;
      if (theirs.bishopsOnly && (myDark ? theirs.lightBishops === 0 : theirs.darkBishops === 0)) return false;
    }
    return true; // lone minor mates only if the enemy has something that can block
  }
  // two or more minor pieces
  const onlyBishops = mine.n === 0;
  const sameColourBishops = onlyBishops && (mine.darkBishops === 0 || mine.lightBishops === 0);
  if (sameColourBishops) {
    // e.g. K+B+B (same colour) vs K, or vs bishops of that same colour: no mate possible
    const colour = mine.darkBishops ? "dark" : "light";
    const enemyHarmless = theirs.other === 0 || (theirs.bishopsOnly && (colour === "dark" ? theirs.lightBishops === 0 : theirs.darkBishops === 0));
    return !enemyHarmless;
  }
  return true;
}
