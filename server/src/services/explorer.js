import { Chess } from "chess.js";
import PositionStat from "../models/PositionStat.js";
import { AppError } from "./users.js";

/** Only the opening phase is indexed: keeps the collection small and the data meaningful. */
export const MAX_PLY = 40;

/** Position identity ignores the move counters, so transpositions share one record. */
export const positionKey = (fen) => fen.split(" ").slice(0, 4).join(" ");

const resultField = (result) => (result === "1-0" ? "white" : result === "0-1" ? "black" : "draws");

/** One upsert per ply of a finished game (pure: easy to test, shared with the rebuild script). */
export function explorerOps(moves, result) {
  const chess = new Chess();
  const field = resultField(result);
  const ops = [];
  for (const m of moves.slice(0, MAX_PLY)) {
    const pos = positionKey(chess.fen());
    const played = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    ops.push({
      updateOne: {
        filter: { pos, san: played.san },
        update: { $inc: { games: 1, [field]: 1 } },
        upsert: true,
      },
    });
  }
  return ops;
}

export function createExplorerService() {
  return {
    async record(moves, result) {
      const ops = explorerOps(moves, result);
      if (ops.length) await PositionStat.bulkWrite(ops, { ordered: false });
    },

    /** Most-played moves from a position, with how those games ended. */
    async lookup(fen) {
      let chess;
      try {
        chess = new Chess(fen);
      } catch {
        throw new AppError(400, "BAD_FEN", "That position isn't valid");
      }
      const rows = await PositionStat.find({ pos: positionKey(chess.fen()) }).sort({ games: -1 }).limit(30).lean();
      const total = rows.reduce((n, r) => n + r.games, 0);
      return {
        fen: chess.fen(),
        turn: chess.turn(),
        total,
        moves: rows.map((r) => ({ san: r.san, games: r.games, white: r.white, draws: r.draws, black: r.black })),
      };
    },
  };
}
