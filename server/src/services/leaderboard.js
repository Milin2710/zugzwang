import User from "../models/User.js";

const RANKED = { gamesPlayed: { $gte: 1 } };

/**
 * Cost per request, with the partial {rating:-1, usernameLower:1} index:
 *  - page of players: index scan of (skip + limit) entries, O(log n + skip + limit)
 *  - rank of the first row: one indexed range count, O(log n + players ahead)
 * Ties share a rank ("1224" ranking): rank = players with a strictly higher rating + 1.
 */
export function createLeaderboardService() {
  return {
    async page({ page = 1, limit = 20 }) {
      const skip = (page - 1) * limit;
      const [rows, total] = await Promise.all([
        User.find(RANKED)
          .sort({ rating: -1, usernameLower: 1 })
          .skip(skip)
          .limit(limit)
          .select("username rating gamesPlayed wins draws losses profilePhoto")
          .lean(),
        User.countDocuments(RANKED),
      ]);

      let rank = rows.length ? (await User.countDocuments({ ...RANKED, rating: { $gt: rows[0].rating } })) + 1 : 1;
      const players = rows.map((u, i) => {
        if (i > 0 && u.rating !== rows[i - 1].rating) rank = skip + i + 1;
        return {
          rank,
          username: u.username,
          rating: u.rating,
          gamesPlayed: u.gamesPlayed,
          wins: u.wins,
          draws: u.draws,
          losses: u.losses,
          profilePhoto: u.profilePhoto,
        };
      });
      return { players, total, page, pages: Math.max(1, Math.ceil(total / limit)), pageSize: limit };
    },

    /** Where a single player stands (null until they've played a rated game). */
    async rankOf(user) {
      if (!user || !(user.gamesPlayed >= 1)) return null;
      const ahead = await User.countDocuments({ ...RANKED, rating: { $gt: user.rating } });
      return { rank: ahead + 1, rating: user.rating };
    },
  };
}
