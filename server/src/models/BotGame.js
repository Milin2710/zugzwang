import mongoose from "mongoose";

const moveSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    san: { type: String, required: true },
    promotion: { type: String },
  },
  { _id: false }
);

/**
 * Practice games against the computer. Deliberately a separate collection from `games`:
 * they never touch ratings, the leaderboard, the explorer or anyone's public profile,
 * and are only ever read back by the player who played them.
 */
const botGameSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    clientId: { type: String, required: true }, // makes a retried save a no-op
    color: { type: String, enum: ["white", "black"], required: true }, // the human's colour
    level: { type: Number, min: 0, max: 20, required: true }, // Stockfish "Skill Level"
    moves: { type: [moveSchema], default: [] },
    finalFen: { type: String, required: true },
    result: { type: String, enum: ["1-0", "0-1", "1/2-1/2"], required: true },
    outcome: { type: String, enum: ["win", "loss", "draw"], required: true }, // for `username`
    reason: {
      type: String,
      enum: ["checkmate", "resignation", "stalemate", "repetition", "insufficient", "fifty-move"],
      required: true,
    },
    endedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

botGameSchema.index({ username: 1, clientId: 1 }, { unique: true });
botGameSchema.index({ username: 1, endedAt: -1 });

export default mongoose.models.BotGame || mongoose.model("BotGame", botGameSchema);
