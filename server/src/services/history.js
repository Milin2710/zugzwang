import Game from "../models/Game.js";
import User from "../models/User.js";
import { AppError } from "./users.js";

const toDto = (g, username) => {
  const isWhite = g.white === username;
  const outcome =
    g.result === "1/2-1/2" ? "draw" : (g.result === "1-0") === isWhite ? "win" : "loss";
  return {
    id: g.gameId,
    opponent: isWhite ? g.black : g.white,
    opponentRating: isWhite ? g.blackRating : g.whiteRating,
    playedAs: isWhite ? "white" : "black",
    outcome,
    result: g.result,
    reason: g.reason,
    ratingDelta: isWhite ? g.whiteDelta : g.blackDelta,
    moves: g.moves.map((m) => m.san),
    finalFen: g.finalFen,
    endedAt: g.endedAt,
  };
};

const mine = (username) => ({ version: 2, $or: [{ white: username }, { black: username }] });

export function createHistoryService() {
  return {
    async profile(username) {
      const user = await User.findOne({ username }).lean();
      if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
      const q = mine(username);
      const [recent, total, wins, draws] = await Promise.all([
        Game.find(q).sort({ endedAt: -1 }).limit(4).lean(),
        Game.countDocuments(q),
        Game.countDocuments({ version: 2, $or: [{ white: username, result: "1-0" }, { black: username, result: "0-1" }] }),
        Game.countDocuments({ ...q, result: "1/2-1/2" }),
      ]);
      return {
        username: user.username,
        rating: user.rating,
        profilePhoto: user.profilePhoto,
        lastOnline: user.lastOnline,
        gamesPlayed: total,
        stats: { wins, draws, losses: total - wins - draws },
        recentGames: recent.map((g) => toDto(g, username)),
      };
    },

    /** Numbered pages, newest first. Uses the {white|black, endedAt} indexes. */
    async games(username, { page = 1, limit = 10 } = {}) {
      const q = mine(username);
      const [rows, total] = await Promise.all([
        Game.find(q).sort({ endedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Game.countDocuments(q),
      ]);
      return { games: rows.map((g) => toDto(g, username)), total, page, pages: Math.max(1, Math.ceil(total / limit)), pageSize: limit };
    },
  };
}
