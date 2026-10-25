import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    clerkId: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    // Lower-cased copy so prefix search can be case-insensitive AND use an index
    usernameLower: { type: String, required: true, index: true },
    email: { type: String, required: true },
    profilePhoto: { type: String },
    rating: { type: Number, default: 1200 },
    // Counters kept up to date when a game is saved (used by the leaderboard)
    gamesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    lastOnline: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Leaderboard: rating-ordered index over players who have played (partial => stays small and fast).
userSchema.index({ rating: -1, usernameLower: 1 }, { partialFilterExpression: { gamesPlayed: { $gte: 1 } } });

userSchema.pre("validate", function setLower(next) {
  if (this.username) this.usernameLower = this.username.toLowerCase();
  next();
});

export default mongoose.models.User || mongoose.model("User", userSchema);
