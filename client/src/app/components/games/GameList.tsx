"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { endingText } from "@/lib/chess";
import { cn } from "@/lib/utils";
import type { GameSummary, Outcome } from "@/lib/types";
import MiniBoard from "./MiniBoard";

const BAR: Record<Outcome, string> = { win: "bg-win", loss: "bg-loss", draw: "bg-draw" };
const LABEL: Record<Outcome, string> = { win: "Win", loss: "Loss", draw: "Draw" };

export default function GameList({ games, emptyText }: { games: GameSummary[]; emptyText?: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (games.length === 0) {
    return <p className="py-10 text-center text-muted-foreground">{emptyText ?? "No games yet. Your first one will show up here."}</p>;
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
      {games.map((game) => {
        const open = expanded === game.id;
        const fullMoves = Math.ceil(game.moves.length / 2);
        return (
          <li key={game.id}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setExpanded(open ? null : game.id)}
              className="flex w-full items-stretch gap-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className={cn("w-1.5 shrink-0", BAR[game.outcome])} aria-hidden />
              <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 pr-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    <span className="font-normal text-muted-foreground">vs </span>
                    {game.opponent}
                    {game.opponentRating != null && <span className="num text-sm font-normal text-muted-foreground"> {game.opponentRating}</span>}
                  </span>
                  <span className="block text-sm">
                    <span className="sr-only">{LABEL[game.outcome]}: </span>
                    {endingText(game.reason, game.outcome)}
                  </span>
                </span>
                <span className="num flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{fullMoves} moves</span>
                  {game.ratingDelta !== 0 && (
                    <span className={cn("font-semibold", game.ratingDelta > 0 ? "text-win" : "text-loss")}>
                      {game.ratingDelta > 0 ? "+" : ""}
                      {game.ratingDelta}
                    </span>
                  )}
                  <span>{new Date(game.endedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
              </span>
              <ChevronDown className={cn("my-auto mr-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>

            {open && (
              <div className="grid gap-6 border-t bg-muted/50 p-4 md:grid-cols-[1fr_auto]">
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Moves</h4>
                  <ol className="num max-h-72 overflow-y-auto rounded-md border bg-card p-3 text-sm">
                    {Array.from({ length: fullMoves }, (_, i) => (
                      <li key={i} className="grid grid-cols-[2.5rem_1fr_1fr] py-0.5">
                        <span className="text-muted-foreground">{i + 1}.</span>
                        <span>{game.moves[i * 2]}</span>
                        <span>{game.moves[i * 2 + 1]}</span>
                      </li>
                    ))}
                  </ol>
                  <Link href="/explorer" className="mt-3 inline-block text-sm text-[hsl(var(--cobalt))] underline-offset-4 hover:underline">
                    Open the explorer
                  </Link>
                </div>
                <div className="w-full md:w-72">
                  <h4 className="mb-2 text-sm font-semibold">Final position</h4>
                  <MiniBoard fen={game.finalFen} orientation={game.playedAs} />
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
