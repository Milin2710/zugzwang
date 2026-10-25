"use client";

import { Button } from "@components/ui/button";
import { endingText } from "@/lib/chess";
import { cn } from "@/lib/utils";
import type { Color, GameSnapshot } from "@/lib/types";

interface GameControlsProps {
  game: GameSnapshot;
  myColor: Color;
  /** ms left for a disconnected opponent to return, or null */
  opponentAwayMs: number | null;
  /** ms left for the very first moves, or null */
  firstMoveMs: number | null;
  notice: string | null;
  onResign: () => void;
  onOfferDraw: () => void;
  onAcceptDraw: () => void;
  onDeclineDraw: () => void;
}

export default function GameControls({
  game, myColor, opponentAwayMs, firstMoveMs, notice, onResign, onOfferDraw, onAcceptDraw, onDeclineDraw,
}: GameControlsProps) {
  const active = game.status === "active";
  const myTurn = game.turn === (myColor === "white" ? "w" : "b");
  const opponentOffered = game.drawOffer && game.drawOffer !== myColor;
  const iOffered = game.drawOffer === myColor;

  // pair SAN moves into rows: 1. e4 e5
  const rows: { n: number; w: string; b?: string }[] = [];
  game.moves.forEach((m, i) => {
    if (i % 2 === 0) rows.push({ n: i / 2 + 1, w: m.san });
    else rows[rows.length - 1].b = m.san;
  });

  const mine = myColor === "white" ? "1-0" : "0-1";
  const finished =
    game.result === "1/2-1/2"
      ? endingText(game.reason ?? "", "draw")
      : game.result
      ? endingText(game.reason ?? "", game.result === mine ? "win" : "loss")
      : "Game over";

  const status = !active
    ? finished
    : opponentAwayMs !== null
    ? `Opponent disconnected. They forfeit in ${Math.ceil(opponentAwayMs / 1000)}s`
    : firstMoveMs !== null
    ? `${myTurn ? "Make your move" : "Waiting for opponent"} (${Math.ceil(firstMoveMs / 1000)}s)`
    : myTurn
    ? "Your move"
    : "Opponent is thinking";

  return (
    <aside className="w-full max-w-sm space-y-4 lg:w-72">
      <div className={cn("rounded-lg border p-4", active && myTurn ? "border-primary bg-card" : "bg-card")} aria-live="polite">
        <p className="font-semibold">{status}</p>
        {notice && <p className="mt-1 text-sm text-loss">{notice}</p>}
      </div>

      <div className="rounded-lg border bg-card p-4">
        {opponentOffered && active ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Your opponent offers a draw.</p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={onAcceptDraw}>Accept</Button>
              <Button className="flex-1" variant="outline" onClick={onDeclineDraw}>Decline</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1" disabled={!active} onClick={onResign}>
              {game.moveCount < 2 ? "Abort" : "Resign"}
            </Button>
            <Button variant="outline" className="flex-1" disabled={!active || iOffered || game.moveCount < 2} onClick={onOfferDraw}>
              {iOffered ? "Draw offered" : "Offer draw"}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <h3 className="border-b px-4 py-2.5 font-semibold">Moves</h3>
        <div className="num max-h-64 overflow-y-auto p-3 text-sm">
          {rows.length === 0 && <p className="font-sans text-muted-foreground">No moves yet.</p>}
          {rows.map((r) => (
            <div key={r.n} className="grid grid-cols-[2.5rem_1fr_1fr] py-0.5">
              <span className="text-muted-foreground">{r.n}.</span>
              <span>{r.w}</span>
              <span>{r.b}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
