"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import GameList from "@components/games/GameList";
import Pagination from "@components/Pagination";
import { useApi } from "@/lib/api";
import { levelName } from "@/lib/bot";
import { cn } from "@/lib/utils";
import type { PagedGames } from "@/lib/types";

type Tab = "rated" | "computer";

interface BotGameDto {
  id: string;
  level: number;
  playedAs: "white" | "black";
  outcome: "win" | "loss" | "draw";
  result: string;
  reason: string;
  moves: string[];
  finalFen: string;
  endedAt: string;
}


const PAGE_SIZE = 10;

export default function Games() {
  const api = useApi();
  const { user } = useUser();
  const [data, setData] = useState<PagedGames | null>(null);
  const [tab, setTab] = useState<Tab>("rated");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (p: number, signal: { cancelled: boolean }) => {
      if (!user?.username) return;
      setLoading(true);
      setError(null);
      try {
        let res: { data: PagedGames };
        if (tab === "rated") {
          res = await api.get<PagedGames>(`/api/users/${encodeURIComponent(user.username)}/games`, {
            params: { page: p, limit: PAGE_SIZE },
          });
        } else {
          // Practice games: only ever the signed-in player's own, from a separate collection.
          const r = await api.get<Omit<PagedGames, "games"> & { games: BotGameDto[] }>("/api/bot-games", {
            params: { page: p, limit: PAGE_SIZE },
          });
          res = {
            data: {
              ...r.data,
              games: r.data.games.map((g) => ({
                id: g.id,
                opponent: `Computer · ${levelName(g.level)}`,
                opponentRating: null,
                playedAs: g.playedAs,
                outcome: g.outcome,
                result: g.result,
                reason: g.reason,
                ratingDelta: 0,
                moves: g.moves,
                finalFen: g.finalFen,
                endedAt: g.endedAt,
              })),
            },
          };
        }
        if (!signal.cancelled) setData(res.data);
      } catch {
        if (!signal.cancelled) setError("Couldn't load your games. Check your connection and try again.");
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [api, user?.username, tab]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    load(page, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load, page]);

  const switchTab = (t: Tab) => {
    if (t === tab) return;
    setData(null);
    setPage(1);
    setTab(t);
  };

  const goTo = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h1 className="display text-4xl">Your games</h1>
        {data && (
          <p className="num text-sm text-muted-foreground">
            {data.total} played · page {data.page} of {Math.max(1, data.pages)}
          </p>
        )}
      </div>

      <div className="mb-5 inline-flex overflow-hidden rounded-lg border bg-card" role="tablist" aria-label="Game type">
        {([["rated", "Rated"], ["computer", "vs Computer"]] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => switchTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              tab === t ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "computer" && <p className="mb-4 text-sm text-muted-foreground">Practice games are unrated and only visible to you.</p>}

      {error && <p className="mb-4 rounded-md border border-loss/40 bg-loss/10 p-3 text-sm text-loss">{error}</p>}

      <div className={loading && data ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {data ? <GameList games={data.games} emptyText={tab === "computer" ? "No practice games yet. Play the computer and they will show up here." : undefined} /> : !error && <p className="py-10 text-center text-muted-foreground">Loading…</p>}
      </div>

      {data && <Pagination className="mt-6" page={data.page} pages={data.pages} onChange={goTo} disabled={loading} />}
    </main>
  );
}
