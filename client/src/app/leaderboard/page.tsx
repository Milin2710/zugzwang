"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import Pagination from "@components/Pagination";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { LeaderboardPage } from "@/lib/types";

const PAGE_SIZE = 20;

export default function Leaderboard() {
  const api = useApi();
  const { user, isLoaded, isSignedIn } = useUser();
  const [data, setData] = useState<LeaderboardPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<LeaderboardPage>("/api/leaderboard", { params: { page, limit: PAGE_SIZE } })
      .then((res) => !cancelled && setData(res.data))
      .catch(() => !cancelled && setError("Couldn't load the leaderboard. Try again in a moment."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, isSignedIn, page]);

  if (isLoaded && !isSignedIn) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="display text-4xl">Leaderboard</h1>
        <p className="mt-3 text-muted-foreground">Sign in to see where you rank.</p>
      </main>
    );
  }

  const me = user?.username;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 className="display text-4xl">Leaderboard</h1>
        {data?.me ? (
          <p className="text-sm">
            You are <span className="num font-semibold">#{data.me.rank}</span> with{" "}
            <span className="num font-semibold">{data.me.rating}</span>
          </p>
        ) : (
          data && <p className="text-sm text-muted-foreground">Finish a rated game to get ranked.</p>
        )}
      </div>

      {error && <p className="mb-4 rounded-md border border-loss/40 bg-loss/10 p-3 text-sm text-loss">{error}</p>}

      <div className={cn("overflow-x-auto rounded-lg border bg-card transition-opacity", loading && data && "opacity-60")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/60 text-left text-muted-foreground">
              <th className="w-16 px-4 py-2.5 font-medium">Rank</th>
              <th className="px-4 py-2.5 font-medium">Player</th>
              <th className="px-4 py-2.5 text-right font-medium">Rating</th>
              <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Games</th>
              <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">W / D / L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!data && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {data?.players.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Nobody is ranked yet. Play a game to be first.
                </td>
              </tr>
            )}
            {data?.players.map((p) => {
              const mine = p.username === me;
              return (
                <tr key={p.username} className={cn(mine && "bg-accent font-semibold")}>
                  <td className={cn("num px-4 py-3", p.rank <= 3 ? "font-bold" : "text-muted-foreground")}>{p.rank}</td>
                  <td className="px-4 py-3">
                    <Link href={`/profile/${encodeURIComponent(p.username)}`} className="underline-offset-4 hover:underline">
                      {p.username}
                    </Link>
                    {mine && <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>}
                  </td>
                  <td className="num px-4 py-3 text-right font-semibold">{p.rating}</td>
                  <td className="num hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">{p.gamesPlayed}</td>
                  <td className="num hidden px-4 py-3 text-right sm:table-cell">
                    <span className="text-win">{p.wins}</span> / <span className="text-muted-foreground">{p.draws}</span> /{" "}
                    <span className="text-loss">{p.losses}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && (
        <>
          <Pagination className="mt-6" page={data.page} pages={data.pages} onChange={setPage} disabled={loading} />
          <p className="num mt-3 text-center text-xs text-muted-foreground">{data.total} ranked players</p>
        </>
      )}
    </main>
  );
}
