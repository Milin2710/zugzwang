"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { isPromotion, pieceImage, squareFromPoint } from "@/lib/chess";
import type { Color, PromotionPiece } from "@/lib/types";
import PromotionPicker from "./PromotionPicker";

interface BoardProps {
  fen: string;
  /** Changes whenever the server sends a new snapshot; clears any optimistic move */
  syncKey: number;
  orientation: Color;
  lastMove: { from: string; to: string } | null;
  /** Which side this user may move right now, or null when it's not their turn / not playing */
  movable: "w" | "b" | null;
  onMove: (from: string, to: string, promotion?: PromotionPiece) => void;
  theme: string;
  children?: React.ReactNode;
}

interface Drag {
  from: Square;
  x: number;
  y: number;
  type: string;
  color: "w" | "b";
}

export default function Board({ fen, syncKey, orientation, lastMove, movable, onMove, theme, children }: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  // Optimistic update: show the move immediately, the server snapshot replaces it moments later.
  const [optimistic, setOptimistic] = useState<{ fen: string; lastMove: { from: string; to: string } } | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: Square; to: Square } | null>(null);

  useEffect(() => {
    setOptimistic(null);
    setSelected(null);
    setDrag(null);
    setPendingPromo(null);
  }, [fen, syncKey]);

  const shownFen = optimistic?.fen ?? fen;
  const shownLast = optimistic?.lastMove ?? lastMove;
  const chess = useMemo(() => new Chess(shownFen), [shownFen]);
  const board = useMemo(() => chess.board(), [chess]);
  const canMove = movable !== null && !optimistic && !pendingPromo && chess.turn() === movable;

  const legalTargets = useMemo(() => {
    if (!selected || !canMove) return new Set<string>();
    return new Set(chess.moves({ square: selected, verbose: true }).map((m) => m.to));
  }, [selected, canMove, chess]);

  const kingInCheck = useMemo(() => {
    if (!chess.inCheck()) return null;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === "k" && p.color === chess.turn()) return p.square;
      }
    return null;
  }, [chess, board]);

  const point = (e: React.PointerEvent) => {
    const rect = boardRef.current!.getBoundingClientRect();
    const size = rect.width / 8;
    const col = Math.min(7, Math.max(0, Math.floor((e.clientX - rect.left) / size)));
    const row = Math.min(7, Math.max(0, Math.floor((e.clientY - rect.top) / size)));
    return { x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2, square: squareFromPoint(col, row, orientation) as Square, size };
  };

  const attempt = (from: Square, to: Square) => {
    const piece = chess.get(from);
    if (!piece) return;
    const legal = chess.moves({ square: from, verbose: true }).some((m) => m.to === to);
    if (!legal) return;
    if (isPromotion(piece.type, piece.color, to)) return setPendingPromo({ from, to });
    commit(from, to);
  };

  const commit = (from: Square, to: Square, promotion?: PromotionPiece) => {
    const next = new Chess(shownFen);
    next.move({ from, to, promotion });
    setOptimistic({ fen: next.fen(), lastMove: { from, to } });
    setSelected(null);
    setPendingPromo(null);
    onMove(from, to, promotion);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canMove) return;
    const { square, x, y } = point(e);
    if (selected && legalTargets.has(square)) return attempt(selected, square); // click-to-move
    const piece = chess.get(square);
    if (piece && piece.color === movable) {
      setSelected(square);
      setDrag({ from: square, x, y, type: piece.type, color: piece.color });
      boardRef.current!.setPointerCapture(e.pointerId);
    } else {
      setSelected(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = point(e);
    setDrag({ ...drag, x, y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const { square } = point(e);
    const from = drag.from;
    setDrag(null);
    if (square !== from) attempt(from, square); // dropped on another square; same square keeps it selected
  };

  const files = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const ranks = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <div
      ref={boardRef}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`relative grid grid-cols-8 grid-rows-8 ${theme}-gradient select-none border-2 touch-none`}
      style={{ width: "min(92vw, 70vh, 640px)", aspectRatio: "1 / 1" }}
    >
      {ranks.map((rIdx, row) =>
        files.map((fIdx, col) => {
          const piece = board[rIdx][fIdx];
          const square = `${"abcdefgh"[fIdx]}${8 - rIdx}`;
          const isLight = (row + col) % 2 === 0; // top-left square is always light, as before
          const isLast = shownLast && (shownLast.from === square || shownLast.to === square);
          const hiddenWhileDragging = drag && drag.from === square;
          return (
            <div key={square} data-square={square} className={`relative flex items-center justify-center ${isLight ? "bg-white" : "bg-transparent"}`}>
              {isLast && <div className="absolute inset-0 bg-yellow-300/50" />}
              {selected === square && <div className="absolute inset-0 bg-emerald-400/50" />}
              {kingInCheck === square && <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(220,38,38,0.85)_0%,rgba(220,38,38,0)_70%)]" />}
              {piece && !hiddenWhileDragging && (
                <img
                  src={pieceImage(piece.type, piece.color)}
                  alt={`${piece.color}${piece.type}`}
                  draggable={false}
                  className={`relative w-full h-full ${canMove && piece.color === movable ? "cursor-grab" : ""}`}
                />
              )}
              {legalTargets.has(square) && (
                <div className={`absolute rounded-full bg-black/30 ${piece ? "inset-[8%] border-4 border-black/30 bg-transparent" : "w-1/4 h-1/4"}`} />
              )}
            </div>
          );
        })
      )}

      {drag && (
        <img
          src={pieceImage(drag.type, drag.color)}
          alt=""
          draggable={false}
          className="absolute z-40 pointer-events-none cursor-grabbing"
          style={{ left: drag.x, top: drag.y, width: "12.5%", height: "12.5%" }}
        />
      )}

      {pendingPromo && (
        <PromotionPicker
          color={movable ?? "w"}
          onPick={(p) => commit(pendingPromo.from, pendingPromo.to, p)}
          onCancel={() => setPendingPromo(null)}
        />
      )}
      {children}
    </div>
  );
}
