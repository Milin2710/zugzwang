"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Chess } from "chess.js";
import { useTheme } from "./ThemeProvider";
import { useUserData } from "../contexts/UserDataContext";
import { useGameSocket } from "@/hooks/useGameSocket";
import { useClocks } from "@/hooks/useClocks";
import type { Color, UserData } from "@/lib/types";
import Board from "./2DChessComponents/Board";
import PlayerBar from "./2DChessComponents/PlayerBar";
import GameControls from "./2DChessComponents/GameControls";
import PairingOverlay from "./2DChessComponents/Pairing";
import HandshakeAnimation from "./2DChessComponents/HandShake";
import ResultOverlay from "./2DChessComponents/ResultOverlay";

const START_FEN = new Chess().fen();

/** Gate: hooks below must not run until Clerk has loaded and the user is signed in. */
export default function ChessBoard2D() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <p className="p-10 text-center text-muted-foreground">Loading…</p>;
  if (!isSignedIn) return <p className="p-10 text-center text-muted-foreground">Sign in to play a rated game.</p>;
  return <PlayScreen />;
}

function PlayScreen() {
  const { theme } = useTheme();
  const { user } = useUser();
  const router = useRouter();
  const { setUserData } = useUserData();
  const me = user?.username ?? "";

  const {
    connected, game, receivedAt, over, connectError, notice,
    joinQueue, leaveQueue, move, resign, offerDraw, acceptDraw, declineDraw,
  } = useGameSocket();
  const clocks = useClocks(game, receivedAt);

  const myColor: Color = game && game.black.username === me ? "black" : "white";
  const opColor: Color = myColor === "white" ? "black" : "white";
  const mySide = myColor === "white" ? "w" : "b";
  const active = game?.status === "active";

  // Handshake animation when a fresh game starts
  const [shakeId, setShakeId] = useState<string | null>(null);
  useEffect(() => {
    if (game && game.status === "active" && game.moveCount === 0) setShakeId(game.id);
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the navbar rating in sync after a rated game
  useEffect(() => {
    const mine = over?.ratings?.[myColor];
    if (mine) setUserData((u: UserData | null) => (u ? { ...u, rating: mine.after } : u));
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = (deadline: number | null | undefined) =>
    deadline && game ? Math.max(0, deadline - game.serverTime - clocks.elapsed) : null;

  const timeline = useMemo(() => game?.fen ?? START_FEN, [game?.fen]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-8 px-4 py-6 lg:flex-row lg:items-start">
      <div className="flex flex-col items-start">
        {game && (
          <PlayerBar
            username={game[opColor].username}
            rating={game[opColor].rating}
            clockMs={clocks[opColor]}
            active={active && game.clockRunning && game.turn === (opColor === "white" ? "w" : "b")}
            away={!!game.disconnect[opColor]}
          />
        )}

        <Board
          fen={timeline}
          syncKey={game?.serverTime ?? 0}
          orientation={myColor}
          lastMove={game?.lastMove ?? null}
          movable={active ? mySide : null}
          onMove={move}
          theme={theme}
        >
          {game && shakeId === game.id && <HandshakeAnimation key={game.id} />}
          {over && game && (
            <ResultOverlay
              over={over}
              myColor={myColor}
              onPlayAgain={joinQueue}
              onHome={() => router.push("/")}
            />
          )}
        </Board>

        {game && (
          <PlayerBar
            username={me}
            rating={game[myColor].rating}
            clockMs={clocks[myColor]}
            active={active && game.clockRunning && game.turn === mySide}
            away={!!game.disconnect[myColor]}
          />
        )}
      </div>

      {game ? (
        <GameControls
          game={game}
          myColor={myColor}
          opponentAwayMs={remaining(game.disconnect[opColor])}
          firstMoveMs={remaining(game.firstMoveDeadline)}
          notice={notice}
          onResign={resign}
          onOfferDraw={offerDraw}
          onAcceptDraw={acceptDraw}
          onDeclineDraw={declineDraw}
        />
      ) : (
        <PairingOverlay
          connected={connected}
          error={connectError}
          onCancel={() => {
            leaveQueue();
            router.push("/");
          }}
        />
      )}
    </div>
  );
}
