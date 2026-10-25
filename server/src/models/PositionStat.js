import mongoose from "mongoose";

/**
 * Opening-explorer data: for a position (normalised FEN) and a move played from it,
 * how many games continued that way and how they ended. One document per (position, move).
 */
const positionStatSchema = new mongoose.Schema({
  pos: { type: String, required: true }, // FEN without move counters
  san: { type: String, required: true },
  games: { type: Number, default: 0 },
  white: { type: Number, default: 0 }, // white won
  draws: { type: Number, default: 0 },
  black: { type: Number, default: 0 }, // black won
});

positionStatSchema.index({ pos: 1, san: 1 }, { unique: true });
positionStatSchema.index({ pos: 1, games: -1 }); // "most common moves first"

export default mongoose.models.PositionStat || mongoose.model("PositionStat", positionStatSchema);
