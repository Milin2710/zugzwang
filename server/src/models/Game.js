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

const gameSchema = new mongoose.Schema(
  {
    // Same id as the live Redis game. Unique => persisting twice is a no-op.
    gameId: { type: String, required: true },
    version: { type: Number, default: 2 }, // v1 = old snapshot-array games
    white: { type: String, required: true },
    black: { type: String, required: true },
    whiteRating: { type: Number, required: true }, // rating at game start
    blackRating: { type: Number, required: true },
    whiteDelta: { type: Number, default: 0 },
    blackDelta: { type: Number, default: 0 },
    ratingApplied: { type: Boolean, default: false },
    moves: { type: [moveSchema], default: [] },
    finalFen: { type: String, required: true },
    result: { type: String, enum: ["1-0", "0-1", "1/2-1/2"], required: true },
    reason: {
      type: String,
      enum: ["checkmate", "resignation", "timeout", "timeout-insufficient", "abandoned", "stalemate", "agreement", "repetition", "insufficient", "fifty-move"],
      required: true,
    },
    startedAt: { type: Date },
    endedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Partial index: games saved by the old version have no gameId and must not collide on "null".
gameSchema.index({ gameId: 1 }, { unique: true, partialFilterExpression: { gameId: { $type: "string" } } });
gameSchema.index({ white: 1, endedAt: -1 });
gameSchema.index({ black: 1, endedAt: -1 });

export default mongoose.models.Game || mongoose.model("Game", gameSchema);
