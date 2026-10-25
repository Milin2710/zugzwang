"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useUser } from "@clerk/nextjs";
import { ChevronLeft, ChevronRight, ChevronsLeft, FlipVertical2 } from "lucide-react";
import Board from "@components/2DChessComponents/Board";
import { useTheme } from "@components/ThemeProvider";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Color, ExplorerResponse, MoveRecord, PromotionPiece } from "@/lib/types";


const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export default function ExplorerPage() {
  const { isLoaded, isSignedIn } = useUser();
  if (isLoaded && !isSignedIn) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="display text-4xl">Explorer</h1>
        <p className="mt-3 text-muted-foreground">Sign in to explore the openings played on Zugzwang.</p>
      </main>
    );
  }
  return <Explorer />;
}

function Explorer() {
  const api = useApi();
  const { theme } = useTheme();

  // The line being explored: moves[0..cursor) are on the board; the rest is "future" for forward/back.
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [cursor, setCursor] = useState(0);
  const [orientation, setOrientation] = useState<Color>("white");

  const fen = useMemo(() => {
    const chess = new Chess();
    for (const m of moves.slice(0, cursor)) chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    return chess.fen();
  }, [moves, cursor]);
  const turn = fen.split(" ")[1] as "w" | "b";
  const lastMove = cursor > 0 ? { from: moves[cursor - 1].from, to: moves[cursor - 1].to } : null;

  // Fetch the most common continuations; cache per position so stepping back/forward is instant.
  const cache = useRef(new Map<string, ExplorerResponse>());
  const [data, setData] = useState<ExplorerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = fen.split(" ").slice(0, 4).join(" ");
    const hit = cache.current.get(key);
    if (hit) {
      setData(hit);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    api
      .get<ExplorerResponse>("/api/explorer", { params: { fen } })
      .then((res) => {
        cache.current.set(key, res.data);
        if (!cancelled) setData(res.data);
      })
      .catch(() => !cancelled && setError("Couldn't load this position. Try again in a moment."));
    return () => {
      cancelled = true;
    };
  }, [api, fen]);

  const playMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece) => {
      const chess = new Chess(fen);
      try {
        const m = chess.move({ from, to, promotion });
        setMoves((prev) => [...prev.slice(0, cursor), { from: m.from, to: m.to, san: m.san, promotion: m.promotion as PromotionPiece | undefined }]);
        setCursor(cursor + 1);
      } catch {
        /* illegal drop: the board snaps back */
      }
    },
    [fen, cursor]
  );

  const playSan = (san: string) => {
    const chess = new Chess(fen);
    try {
      const m = chess.move(san);
      playMove(m.from, m.to, m.promotion as PromotionPiece | undefined);
    } catch {
      /* stale row: ignore */
    }
  };

  const back = useCallback(() => setCursor((c) => Math.max(0, c - 1)), []);
  const forward = useCallback(() => setCursor((c) => Math.min(moves.length, c + 1)), [moves.length]);
  const reset = () => {
    setMoves([]);
    setCursor(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") back();
      if (e.key === "ArrowRight") forward();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, forward]);

  const rows: { n: number; w?: number; b?: number }[] = [];
  moves.forEach((_, i) => {
    if (i % 2 === 0) rows.push({ n: i / 2 + 1, w: i });
    else rows[rows.length - 1].b = i;
  });
  const chip = (idx?: number) =>
    idx === undefined ? (
      <span />
    ) : (
      <button
        onClick={() => setCursor(idx + 1)}
        className={cn("w-fit rounded px-1.5 py-0.5 text-left hover:bg-accent", idx + 1 === cursor && "bg-primary text-primary-foreground hover:bg-primary")}
      >
        {moves[idx].san}
      </button>
    );

  const iconBtn =
    "inline-flex h-10 w-10 items-center justify-center rounded-md border bg-card transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="display text-4xl">Explorer</h1>
      <p className="mt-2 max-w-xl text-muted-foreground">
        Play moves on the board to see what people on Zugzwang actually play from that position, and how those games ended.
      </p>

      <div className="mt-8 flex flex-col items-center gap-8 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-3">
          <Board
            fen={fen}
            syncKey={cursor * 1000 + moves.length}
            orientation={orientation}
            lastMove={lastMove}
            movable={turn}
            onMove={playMove}
            theme={theme}
          />
          <div className="flex items-center gap-2">
            <button className={iconBtn} onClick={reset} disabled={moves.length === 0} aria-label="Back to the start">
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button className={iconBtn} onClick={back} disabled={cursor === 0} aria-label="Previous move">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className={iconBtn} onClick={forward} disabled={cursor >= moves.length} aria-label="Next move">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button className={cn(iconBtn, "ml-auto")} onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))} aria-label="Flip board">
              <FlipVertical2 className="h-4 w-4 rotate-90" />
            </button>
          </div>
        </div>

        <div className="w-full min-w-0 flex-1 space-y-6">
          <section className="overflow-hidden rounded-lg border bg-card">
            <header className="flex items-baseline justify-between gap-4 border-b bg-muted/60 px-4 py-2.5">
              <h2 className="font-semibold">{turn === "w" ? "White" : "Black"} to move</h2>
              <p className="num text-sm text-muted-foreground">{data ? `${data.total} games reached this position` : "…"}</p>
            </header>

            {error && <p className="p-4 text-sm text-loss">{error}</p>}

            {data && data.moves.length === 0 && !error && (
              <p className="p-6 text-sm text-muted-foreground">
                No game on Zugzwang has played on from here yet. Only the first 40 half-moves of each game are recorded.
              </p>
            )}

            {data && data.moves.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Move</th>
                    <th className="px-2 py-2 text-right font-medium">Games</th>
                    <th className="w-full px-4 py-2 font-medium">
                      <span className="flex items-center gap-3">
                        Results
                        <span className="flex items-center gap-1 text-xs font-normal">
                          <i className="inline-block h-2.5 w-2.5 rounded-sm border bg-white" /> White
                          <i className="ml-1 inline-block h-2.5 w-2.5 rounded-sm bg-draw" /> Draw
                          <i className="ml-1 inline-block h-2.5 w-2.5 rounded-sm bg-ink" /> Black
                        </span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.moves.map((m) => {
                    const w = pct(m.white, m.games);
                    const d = pct(m.draws, m.games);
                    const b = Math.max(0, 100 - w - d);
                    return (
                      <tr key={m.san} onClick={() => playSan(m.san)} className="cursor-pointer hover:bg-accent/60">
                        <td className="px-4 py-2">
                          <button className="num font-semibold focus-visible:outline-none focus-visible:underline" onClick={(e) => (e.stopPropagation(), playSan(m.san))}>
                            {m.san}
                          </button>
                        </td>
                        <td className="num px-2 py-2 text-right">
                          {m.games}
                          <span className="ml-1.5 text-xs text-muted-foreground">{pct(m.games, data.total)}%</span>
                        </td>
                        <td className="px-4 py-2">
                          <div
                            className="num flex h-6 overflow-hidden rounded border text-[11px] leading-6"
                            role="img"
                            aria-label={`White ${w}%, draws ${d}%, black ${b}%`}
                          >
                            <span className="bg-white text-center text-ink" style={{ width: `${w}%` }}>
                              {w >= 12 && `${w}%`}
                            </span>
                            <span className="bg-draw text-center text-white" style={{ width: `${d}%` }}>
                              {d >= 12 && `${d}%`}
                            </span>
                            <span className="bg-ink text-center text-white" style={{ width: `${b}%` }}>
                              {b >= 12 && `${b}%`}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-lg border bg-card">
            <header className="border-b bg-muted/60 px-4 py-2.5">
              <h2 className="font-semibold">Your line</h2>
            </header>
            <div className="num max-h-48 overflow-y-auto p-3 text-sm">
              {rows.length === 0 ? (
                <p className="px-1 py-1 font-sans text-muted-foreground">Make a move to start a line.</p>
              ) : (
                rows.map((r) => (
                  <div key={r.n} className="grid grid-cols-[2.5rem_1fr_1fr] items-center py-0.5">
                    <span className="text-muted-foreground">{r.n}.</span>
                    {chip(r.w)}
                    {chip(r.b)}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
