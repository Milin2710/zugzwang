import type { Color, Outcome, PromotionPiece } from "./types";

const NAMES: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

/** public/pieces/<name>-<w|b>.svg (absolute path so it works on every route) */
export const pieceImage = (type: string, color: "w" | "b") => `/pieces/${NAMES[type]}-${color}.svg`;

export const FILES = "abcdefgh";

export function squareFromPoint(col: number, row: number, orientation: Color): string {
  const file = orientation === "white" ? col : 7 - col;
  const rank = orientation === "white" ? 8 - row : row + 1;
  return `${FILES[file]}${rank}`;
}

export function isPromotion(pieceType: string, color: "w" | "b", to: string): boolean {
  return pieceType === "p" && ((color === "w" && to[1] === "8") || (color === "b" && to[1] === "1"));
}

export const PROMOTION_CHOICES: PromotionPiece[] = ["q", "r", "b", "n"];

export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 10_000) {
    // last 10 seconds: show tenths, like chess.com / lichess
    const secs = Math.floor(total / 1000);
    const tenths = Math.floor((total % 1000) / 100);
    return `0:${String(secs).padStart(2, "0")}.${tenths}`;
  }
  const s = Math.ceil(total / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * How a game ended, worded for the person reading: "Won by resignation", "Lost on time",
 * "Draw — timeout vs insufficient material"…  Pass the outcome from that player's point of view.
 */
export function endingText(reason: string, outcome: Outcome | "aborted"): string {
  if (outcome === "aborted" || reason === "aborted") return "Aborted — too few moves";
  if (outcome === "draw") {
    switch (reason) {
      case "agreement": return "Draw by agreement";
      case "stalemate": return "Draw by stalemate";
      case "repetition": return "Draw by threefold repetition";
      case "insufficient": return "Draw — insufficient material";
      case "fifty-move": return "Draw by the 50-move rule";
      case "timeout-insufficient": return "Draw — timeout vs insufficient material";
      default: return "Draw";
    }
  }
  const verb = outcome === "win" ? "Won" : "Lost";
  switch (reason) {
    case "checkmate": return `${verb} by checkmate`;
    case "resignation": return outcome === "win" ? "Won — opponent resigned" : "Lost — you resigned";
    case "timeout": return `${verb} on time`;
    case "abandoned": return outcome === "win" ? "Won — opponent left the game" : "Lost — you left the game";
    default: return verb;
  }
}

/** Page numbers to render, with "…" gaps: 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push("…");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push("…");
  out.push(pages);
  return out;
}
