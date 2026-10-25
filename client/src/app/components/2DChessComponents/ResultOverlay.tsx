"use client";

import { Button } from "@components/ui/button";
import { endingText } from "@/lib/chess";
import type { Color, GameOver } from "@/lib/types";

interface Props {
  over: GameOver;
  myColor: Color;
  onPlayAgain: () => void;
  onHome: () => void;
}

export default function ResultOverlay({ over, myColor, onPlayAgain, onHome }: Props) {
  const aborted = over.result === "aborted";
  const draw = over.result === "1/2-1/2";
  const won = over.winner === myColor;
  const title = aborted ? "Game aborted" : draw ? "Draw" : won ? "You won" : "You lost";
  const detail = endingText(over.reason, aborted ? "aborted" : draw ? "draw" : won ? "win" : "loss");
  const mine = over.ratings?.[myColor];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink/50">
      <div className="flex w-[min(18rem,86%)] flex-col items-center gap-2 rounded-lg border bg-card p-6 text-center shadow-xl">
        {won && <img src="/Victory.gif" alt="" className="h-24" />}
        <h2 className="display text-3xl">{title}</h2>
        <p className="text-sm text-muted-foreground">{detail}</p>
        {mine && (
          <p className="num text-lg font-semibold">
            {mine.before} → {mine.after}{" "}
            <span className={mine.delta > 0 ? "text-win" : mine.delta < 0 ? "text-loss" : ""}>
              ({mine.delta > 0 ? "+" : ""}
              {mine.delta})
            </span>
          </p>
        )}
        {aborted && <p className="text-xs text-muted-foreground">Too few moves were played — no rating change.</p>}
        <div className="mt-2 flex w-full gap-2">
          <Button className="flex-1" onClick={onPlayAgain}>
            Play again
          </Button>
          <Button variant="outline" className="flex-1" onClick={onHome}>
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}
