import User from "../models/User.js";

export class AppError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createUserService({ clerkAuth }) {
  return {
    findByClerkId: (clerkId) => User.findOne({ clerkId }),

    /** Create or refresh the local user from Clerk. Idempotent and race-safe (single upsert). */
    async upsertFromClerk(clerkId) {
      const profile = await clerkAuth.getProfile(clerkId);
      if (!profile.username) throw new AppError(400, "USERNAME_REQUIRED", "Set a username on your account first");
      try {
        return await User.findOneAndUpdate(
          { clerkId },
          {
            $set: {
              username: profile.username,
              usernameLower: profile.username.toLowerCase(),
              email: profile.email,
              profilePhoto: profile.profilePhoto,
              lastOnline: new Date(),
            },
            $setOnInsert: { rating: 1200 },
          },
          { upsert: true, new: true, runValidators: true }
        );
      } catch (err) {
        if (err?.code === 11000) throw new AppError(409, "USERNAME_TAKEN", "That username is already in use");
        throw err;
      }
    },

    /** Resolve the local user for a verified token, creating it on first sight. */
    async ensure(clerkId) {
      const existing = await User.findOne({ clerkId });
      // Users created by the previous version have no usernameLower (needed for search): backfill on sight.
      if (existing?.usernameLower) return existing;
      return this.upsertFromClerk(clerkId);
    },

    async getRating(username) {
      const u = await User.findOne({ username }).select("rating").lean();
      return u?.rating ?? 1200;
    },

    touchLastOnline: (username) => User.updateOne({ username }, { $set: { lastOnline: new Date() } }),

    /** Case-insensitive prefix search that uses the usernameLower index. */
    async search(query, limit = 10) {
      const q = String(query).trim().toLowerCase().slice(0, 30);
      if (!q) return [];
      const users = await User.find({ usernameLower: new RegExp(`^${escapeRegex(q)}`) })
        .sort({ usernameLower: 1 })
        .limit(limit)
        .select("username")
        .lean();
      return users.map((u) => u.username);
    },
  };
}
