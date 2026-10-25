"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Socket } from "socket.io-client";
import { createGameSocket } from "@/lib/socket";
import type { GameOver, GameSnapshot, PromotionPiece } from "@/lib/types";

const ERROR_TEXT: Record<string, string> = {
  NOT_YOUR_TURN: "It's not your turn.",
  ILLEGAL_MOVE: "That move isn't legal.",
  TIMEOUT: "Your time ran out.",
  TOO_EARLY: "You can offer a draw after the first moves.",
  ALREADY_OFFERED: "You already offered a draw in this position.",
  RATE_LIMITED: "Slow down a little.",
  NO_GAME: "There is no game in progress.",
  GAME_OVER: "The game is already over.",
};

/**
 * All real-time game state for the Play page.
 * The server is the single source of truth: this hook only mirrors the latest
 * snapshot it was sent and exposes actions that send intents back.
 */
export function useGameSocket({ autoQueue = true }: { autoQueue?: boolean } = {}) {
  const { getToken, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [queued, setQueued] = useState(false);
  const [game, setGame] = useState<GameSnapshot | null>(null);
  /** performance.now-style receipt time of `game`, used for smooth local clock countdown */
  const [receivedAt, setReceivedAt] = useState(0);
  const [over, setOver] = useState<GameOver | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const overRef = useRef<GameOver | null>(null);
  overRef.current = over;

  useEffect(() => {
    if (!isSignedIn) return;
    const socket = createGameSocket(() => getTokenRef.current());
    socketRef.current = socket;

    const applyState = (g: GameSnapshot) => {
      setGame(g);
      setReceivedAt(Date.now());
      if (g.status === "active") {
        setQueued(false);
        setOver(null);
      }
    };

    socket.on("connect", () => {
      setConnected(true);
      setConnectError(null);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (err) =>
      setConnectError(err.message === "UNAUTHORIZED" ? "Please sign in again." : "Can't reach the game server. Retrying…")
    );

    // Sent on every (re)connect: resume a game in progress, or start looking for one.
    socket.on("session:ready", ({ game: resumed }: { game: GameSnapshot | null }) => {
      if (resumed) applyState(resumed);
      else if (autoQueue && !overRef.current) socket.emit("queue:join");
    });
    socket.on("queue:waiting", () => setQueued(true));
    socket.on("queue:left", () => setQueued(false));
    socket.on("game:state", applyState);
    socket.on("game:over", (o: GameOver) => setOver(o));
    socket.on("game:error", ({ code }: { code: string }) => {
      const text = ERROR_TEXT[code];
      if (text) setNotice(text);
    });

    return () => {
      // Leaving the page closes the socket; the server gives a short grace period
      // before treating that as a forfeit, so a refresh doesn't lose the game.
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isSignedIn, autoQueue]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const emit = useCallback((event: string, payload?: unknown) => socketRef.current?.emit(event, payload), []);

  return {
    connected,
    queued,
    game,
    receivedAt,
    over,
    connectError,
    notice,
    /** Start looking for a new game (also used for "Play again"). */
    joinQueue: useCallback(() => {
      setOver(null);
      setGame(null);
      emit("queue:join");
    }, [emit]),
    leaveQueue: useCallback(() => emit("queue:leave"), [emit]),
    move: useCallback((from: string, to: string, promotion?: PromotionPiece) => emit("game:move", { from, to, promotion }), [emit]),
    resign: useCallback(() => emit("game:resign"), [emit]),
    offerDraw: useCallback(() => emit("draw:offer"), [emit]),
    acceptDraw: useCallback(() => emit("draw:accept"), [emit]),
    declineDraw: useCallback(() => emit("draw:decline"), [emit]),
  };
}
