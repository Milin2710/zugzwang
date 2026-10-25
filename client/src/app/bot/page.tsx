"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import Board from "@components/2DChessComponents/Board";
import PlayerBar from "@components/2DChessComponents/PlayerBar";
import { useTheme } from "@components/ThemeProvider";
import { Button } from "@components/ui/button";
import { useApi } from "@/lib/api";
import { BOT_LEVELS, levelName, type BotLevel } from "@/lib/bot";
import { endingText } from "@/lib/chess";
import { StockfishEngine } from "@/lib/stockfish";
import { cn } from "@/lib/utils";
import type { Color, MoveRecord, Outcome, PromotionPiece } from "@/lib/types";

type Choice = Color | "random";

interface Game {
  id: string;
  humanColor: Color;
  level: BotLevel;
  moves: MoveRecord[];
  resigned: boolean;
}

const uci = (m: MoveRecord) => `${m.from}${m.to}${m.promotion ?? ""}`;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

export default function BotPage() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <p className="p-10 text-center text-muted-foreground">Loading…</p>;
  if (!isSignedIn) return <p className="p-10 text-center text-muted-foreground">Sign in to play the computer.</p>;
  return <BotGame />;
}

function BotGame() {
  const api = useApi();
  const { theme } = useTheme();

  const [skill, setSkill] = useState(9);
  const [choice, setChoice] = useState<Choice>("white");
  const [game, setGame] = useState<Game | null>(null);
  const [thinking, setThinking] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // One engine (Web Worker) for the lifetime of the page.
  const engineRef = useRef<StockfishEngine | null>(null);
  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    engine.init().catch((e: Error) => setEngineError(e.message));
    return () => {
      engine.terminate();
      engineRef.current = null;
    };
  }, []);

  // The position is always derived from the move list, so there is one source of truth.
  const chess = useMemo(() => {
    const c = new Chess();
    for (const m of game?.moves ?? []) c.move({ from: m.from, to: m.to, promotion: m.promotion });
    return c;
  }, [game?.moves]);

  const humanSide = game?.humanColor === "black" ? "b" : "w";
  const over = !!game && (game.resigned || chess.isGameOver());

  const outcome: Outcome | null = useMemo(() => {
    if (!game || !over) return null;
    if (game.resigned) return "loss";
    if (chess.isCheckmate()) return chess.turn() === humanSide ? "loss" : "win";
    return "draw";
  }, [game, over, chess, humanSide]);

  const reason = useMemo(() => {
    if (!game || !over) return "";
    if (game.resigned) return "resignation";
    if (chess.isCheckmate()) return "checkmate";
    if (chess.isStalemate()) return "stalemate";
    if (chess.isInsufficientMaterial()) return "insufficient";
    if (chess.isThreefoldRepetition()) return "repetition";
    return "fifty-move";
  }, [game, over, chess]);

  const append = useCallback((gameId: string, rec: MoveRecord) => {
    setGame((g) => (g && g.id === gameId ? { ...g, moves: [...g.moves, rec] } : g));
  }, []);

  // Engine's turn: ask Stockfish, apply its move (ignored if the game changed meanwhile).
  useEffect(() => {
    if (!game || over || chess.turn() === humanSide) return;
    const engine = engineRef.current;
    if (!engine) return;
    let cancelled = false;
    setThinking(true);
    engine
      .bestMove(game.moves.map(uci), game.level)
      .then((best) => {
        if (cancelled) return;
        const from = best.slice(0, 2);
        const to = best.slice(2, 4);
        const promotion = (best[4] as PromotionPiece | undefined) || undefined;
        const next = new Chess(chess.fen());
        const made = next.move({ from, to, promotion });
        append(game.id, { from: made.from, to: made.to, san: made.san, promotion: made.promotion as PromotionPiece | undefined });
      })
      .catch(() => !cancelled && setEngineError("The engine stopped responding. Start a new game to try again."))
      .finally(() => !cancelled && setThinking(false));
    return () => {
      cancelled = true;
      engine.stop();
      setThinking(false);
    };
  }, [game?.id, game?.moves.length, over]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (from: string, to: string, promotion?: PromotionPiece) => {
    if (!game || over || chess.turn() !== humanSide) return;
    const next = new Chess(chess.fen());
    try {
      const made = next.move({ from, to, promotion });
      append(game.id, { from: made.from, to: made.to, san: made.san, promotion: made.promotion as PromotionPiece | undefined });
    } catch {
      /* the board only offers legal moves; ignore anything else */
    }
  };

  // Finished games are saved once (the id makes a retried save harmless).
  const savedFor = useRef<string | null>(null);
  const saveGame = useCallback(async () => {
    if (!game) return;
    setSave("saving");
    try {
      await api.post("/api/bot-games", {
        clientId: game.id,
        color: game.humanColor,
        level: game.level.skill,
        moves: game.moves.map(uci),
        resigned: game.resigned,
      });
      setSave("saved");
    } catch {
      setSave("error");
    }
  }, [api, game]);

  useEffect(() => {
    if (!game || !over || savedFor.current === game.id) return;
    savedFor.current = game.id;
    saveGame();
  }, [game, over, saveGame]);

  const start = () => {
    const humanColor: Color = choice === "random" ? (Math.random() < 0.5 ? "white" : "black") : choice;
    engineRef.current?.newGame();
    setSave("idle");
    setGame({ id: newId(), humanColor, level: BOT_LEVELS.find((l) => l.skill === skill) ?? BOT_LEVELS[2], moves: [], resigned: false });
  };

  const rows: { n: number; w: string; b?: string }[] = [];
  (game?.moves ?? []).forEach((m, i) => {
    if (i % 2 === 0) rows.push({ n: i / 2 + 1, w: m.san });
    else rows[rows.length - 1].b = m.san;
  });

  // ---------- setup screen ----------
  if (!game) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <h1 className="display text-4xl">Play the computer</h1>
        <p className="mt-2 text-muted-foreground">
          Practice against Stockfish, right in your browser. These games are unrated, don&apos;t count towards the explorer, and
          only you can see them.
        </p>

        <fieldset className="mt-8">
          <legend className="mb-2 font-semibold">Strength</legend>
          <div className="grid gap-2">
            {BOT_LEVELS.map((l) => (
              <button
                key={l.skill}
                type="button"
                aria-pressed={skill === l.skill}
                onClick={() => setSkill(l.skill)}
                className={cn(
                  "flex items-baseline justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  skill === l.skill ? "border-primary bg-card ring-1 ring-primary" : "bg-card hover:bg-accent"
                )}
              >
                <span className="font-semibold">{l.name}</span>
                <span className="text-sm text-muted-foreground">{l.blurb}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="mb-2 font-semibold">You play</legend>
          <div className="inline-flex overflow-hidden rounded-lg border bg-card">
            {(["white", "black", "random"] as Choice[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={choice === c}
                onClick={() => setChoice(c)}
                className={cn(
                  "px-5 py-2 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  choice === c ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>

        {engineError && <p className="mt-6 rounded-md border border-loss/40 bg-loss/10 p-3 text-sm text-loss">{engineError}</p>}

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button size="lg" onClick={start} disabled={!!engineError}>
            Start game
          </Button>
          <Link href="/games" className="text-sm font-medium underline-offset-4 hover:underline">
            Your practice games
          </Link>
        </div>
      </main>
    );
  }

  // ---------- game screen ----------
  const botSide = humanSide === "w" ? "b" : "w";
  const last = game.moves[game.moves.length - 1];
  const status = engineError
    ? engineError
    : over
    ? outcome === "draw"
      ? endingText(reason, "draw")
      : outcome === "win"
      ? endingText(reason, "win")
      : game.resigned
      ? "You resigned"
      : endingText(reason, "loss")
    : thinking
    ? "Stockfish is thinking…"
    : chess.turn() === humanSide
    ? "Your move"
    : "Starting the engine…";

  return (
    <main className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-8 px-4 py-6 lg:flex-row lg:items-start">
      <div className="flex flex-col items-start">
        <PlayerBar username={`Stockfish · ${game.level.name}`} clockMs={null} active={false} />
        <Board
          fen={chess.fen()}
          syncKey={game.moves.length}
          orientation={game.humanColor}
          lastMove={last ? { from: last.from, to: last.to } : null}
          movable={over ? null : humanSide}
          onMove={onMove}
          theme={theme}
        />
        <PlayerBar username="You" clockMs={null} active={false} />
      </div>

      <aside className="w-full max-w-sm space-y-4 lg:w-72">
        <div className={cn("rounded-lg border bg-card p-4", !over && chess.turn() === humanSide && "border-primary")} aria-live="polite">
          <p className="font-semibold">{status}</p>
          {over && outcome && (
            <p className="mt-1 text-sm text-muted-foreground">
              {outcome === "win" ? "You beat" : outcome === "loss" ? "Lost to" : "Drew with"} {levelName(game.level.skill)} Stockfish
            </p>
          )}
          {over && (
            <p className={cn("mt-2 text-xs", save === "error" ? "text-loss" : "text-muted-foreground")}>
              {save === "saving" && "Saving to your practice games…"}
              {save === "saved" && "Saved to your practice games. Only you can see it."}
              {save === "error" && (
                <>
                  Couldn&apos;t save this game.{" "}
                  <button className="font-medium underline underline-offset-2" onClick={saveGame}>
                    Try again
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          {over ? (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={start}>
                Play again
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setGame(null)}>
                Change level
              </Button>
            </div>
          ) : (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => (game.moves.length < 2 ? setGame(null) : setGame({ ...game, resigned: true }))}
            >
              {game.moves.length < 2 ? "Abort" : "Resign"}
            </Button>
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
        <p className="sr-only">Computer plays {botSide === "w" ? "white" : "black"}.</p>
      </aside>
    </main>
  );
}
