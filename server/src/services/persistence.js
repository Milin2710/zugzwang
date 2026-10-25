import Game from "../models/Game.js";
import User from "../models/User.js";
import { explorerOps } from "./explorer.js";
import PositionStat from "../models/PositionStat.js";

/**
 * Writes a finished game and applies rating changes exactly once.
 *  1. Insert the game (unique gameId -> a retry hits E11000 and is skipped).
 *  2. Claim the stats update with a conditional write; only the caller that flips
 *     ratingApplied false->true applies the rating/counter $inc and the explorer counts,
 *     so none of them can ever be applied twice.
 * (On a replica set you could wrap both steps in a transaction; this also works on a
 * standalone mongod.)
 */
export function createPersistence() {
  return {
    async saveFinishedGame(rec) {
      try {
        await Game.create({ ...rec, ratingApplied: false });
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
      const claim = await Game.updateOne({ gameId: rec.gameId, ratingApplied: false }, { $set: { ratingApplied: true } });
      if (claim.modifiedCount === 1) {
        const score = (side) => {
          if (rec.result === "1/2-1/2") return { draws: 1 };
          const won = (rec.result === "1-0") === (side === "white");
          return won ? { wins: 1 } : { losses: 1 };
        };
        await User.bulkWrite([
          { updateOne: { filter: { username: rec.white }, update: { $inc: { rating: rec.whiteDelta, gamesPlayed: 1, ...score("white") } } } },
          { updateOne: { filter: { username: rec.black }, update: { $inc: { rating: rec.blackDelta, gamesPlayed: 1, ...score("black") } } } },
        ]);
        // Opening-explorer statistics, counted once per game under the same claim.
        const ops = explorerOps(rec.moves, rec.result);
        if (ops.length) await PositionStat.bulkWrite(ops, { ordered: false });
      }
    },
  };
}
