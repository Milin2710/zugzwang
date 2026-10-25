"use client";

import { PROMOTION_CHOICES, pieceImage } from "@/lib/chess";
import type { PromotionPiece } from "@/lib/types";

export default function PromotionPicker({
  color,
  onPick,
  onCancel,
}: {
  color: "w" | "b";
  onPick: (piece: PromotionPiece) => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50" onPointerDown={(e) => { e.stopPropagation(); onCancel(); }}>
      <div className="flex gap-2 rounded-lg bg-white p-3 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
        {PROMOTION_CHOICES.map((p) => (
          <button
            key={p}
            type="button"
            aria-label={`Promote to ${p}`}
            onClick={() => onPick(p)}
            className="h-16 w-16 rounded-md border bg-amber-50 p-1 hover:bg-amber-200"
          >
            <img src={pieceImage(p, color)} alt={p} draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}
