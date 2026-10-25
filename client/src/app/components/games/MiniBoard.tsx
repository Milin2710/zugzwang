import { Chess } from "chess.js";
import { pieceImage } from "@/lib/chess";
import { cn } from "@/lib/utils";
import type { Color } from "@/lib/types";

/**
 * Static board for a FEN, with `orientation` at the bottom.
 * The container is a fixed square and the grid has 8 equal rows AND columns, so empty squares
 * can no longer collapse while squares holding a piece stretch (which is what happened before:
 * rows were sized by their content). Pieces are absolutely positioned and can't affect layout.
 */
export default function MiniBoard({
  fen,
  orientation,
  className,
}: {
  fen: string;
  orientation: Color;
  className?: string;
}) {
  const board = new Chess(fen).board();
  const rows = orientation === "white" ? board : [...board].reverse().map((r) => [...r].reverse());
  return (
    <div
      className={cn("grid aspect-square w-full max-w-[20rem] grid-cols-8 grid-rows-8 overflow-hidden rounded-md border border-border", className)}
      role="img"
      aria-label="Chess position"
    >
      {rows.map((rank, r) =>
        rank.map((piece, c) => (
          <div
            key={`${r}-${c}`}
            className="relative min-h-0 min-w-0"
            style={{ background: (r + c) % 2 === 0 ? "var(--sq-light)" : "var(--sq-dark)" }}
          >
            {piece && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pieceImage(piece.type, piece.color)} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
            )}
          </div>
        ))
      )}
    </div>
  );
}
