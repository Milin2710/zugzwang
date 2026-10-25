import { Chess } from "chess.js";
import BotGame from "../models/BotGame.js";
import { AppError } from "./users.js";

export const MAX_PLIES = 600;
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const UCI = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

/**
 * The browser runs Stockfish and the game, so nothing it says is trusted: we replay the moves
 * with chess.js (illegal move => 400) and work out the result ourselves. The only thing taken
 * from the client is "I resigned", and only if the game isn't already over.
 */
export function judge({ color, moves, resigned }) {
  if (!["white", "black"].includes(color)) throw new AppError(400, "BAD_REQUEST", "color must be white or black");
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > MAX_PLIES) {
    throw new AppError(400, "BAD_REQUEST", `moves must be a list of 1-${MAX_PLIES} moves`);
  }
  const chess = new Chess();
  const played = [];
  for (const m of moves) {
    const parts = typeof m === "string" ? UCI.exec(m) : null;
    if (!parts) throw new AppError(400, "BAD_MOVES", "Moves must look like e2e4 or e7e8q");
    let made;
    try {
      made = chess.move({ from: parts[1], to: parts[2], promotion: parts[3] });
    } catch {
      throw new AppError(400, "BAD_MOVES", "The move list isn't a legal game");
    }
    played.push({ from: made.from, to: made.to, san: made.san, ...(made.promotion ? { promotion: made.promotion } : {}) });
  }

  let result;
  let reason;
  if (chess.isCheckmate()) {
    result = chess.turn() === "w" ? "0-1" : "1-0"; // the side to move is the one mated
    reason = "checkmate";
  } else if (chess.isStalemate()) [result, reason] = ["1/2-1/2", "stalemate"];
  else if (chess.isInsufficientMaterial()) [result, reason] = ["1/2-1/2", "insufficient"];
  else if (chess.isThreefoldRepetition()) [result, reason] = ["1/2-1/2", "repetition"];
  else if (chess.isDrawByFiftyMoves()) [result, reason] = ["1/2-1/2", "fifty-move"];
  else if (resigned === true && played.length >= 2) {
    result = color === "white" ? "0-1" : "1-0"; // the computer wins
    reason = "resignation";
  } else throw new AppError(400, "GAME_NOT_FINISHED", "That game isn't finished");

  const outcome = result === "1/2-1/2" ? "draw" : (result === "1-0") === (color === "white") ? "win" : "loss";
  return { moves: played, finalFen: chess.fen(), result, outcome, reason };
}

const toDto = (g) => ({
  id: String(g._id),
  level: g.level,
  playedAs: g.color,
  outcome: g.outcome,
  result: g.result,
  reason: g.reason,
  moves: g.moves.map((m) => m.san),
  finalFen: g.finalFen,
  endedAt: g.endedAt,
});

export function createBotGameService() {
  return {
    async save(username, body = {}) {
      const { clientId, color, level, moves, resigned } = body;
      if (typeof clientId !== "string" || !CLIENT_ID.test(clientId)) throw new AppError(400, "BAD_REQUEST", "clientId is required");
      if (!Number.isInteger(level) || level < 0 || level > 20) throw new AppError(400, "BAD_REQUEST", "level must be 0-20");
      const verdict = judge({ color, moves, resigned });
      try {
        const doc = await BotGame.create({ username, clientId, color, level, ...verdict });
        return toDto(doc);
      } catch (err) {
        if (err?.code === 11000) return toDto(await BotGame.findOne({ username, clientId }).lean()); // retry of the same save
        throw err;
      }
    },

    /** Only ever called with the signed-in user's own name. */
    async list(username, { page = 1, limit = 10 }) {
      const [rows, total] = await Promise.all([
        BotGame.find({ username }).sort({ endedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        BotGame.countDocuments({ username }),
      ]);
      return { games: rows.map(toDto), total, page, pages: Math.max(1, Math.ceil(total / limit)), pageSize: limit };
    },
  };
}
