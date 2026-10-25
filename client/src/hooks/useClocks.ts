"use client";

import { useEffect, useState } from "react";
import type { GameSnapshot } from "@/lib/types";

/**
 * Smoothly counts down the side to move between server snapshots.
 * The server is authoritative; every snapshot re-syncs the numbers.
 */
export function useClocks(game: GameSnapshot | null, receivedAt: number) {
  const [, tick] = useState(0);
  const running = !!game && game.status === "active";

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [running, game?.serverTime]);

  if (!game) return { white: 0, black: 0, elapsed: 0 };
  const elapsed = running ? Date.now() - receivedAt : 0;
  const ticking = running && game.clockRunning;
  const dec = (side: "w" | "b", base: number) => Math.max(0, ticking && game.turn === side ? base - elapsed : base);
  return { white: dec("w", game.clocks.white), black: dec("b", game.clocks.black), elapsed };
}
