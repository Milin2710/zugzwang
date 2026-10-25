"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import PlayerPage from "./components/indexComponents/PlayerPage";
import MiniBoard from "./components/games/MiniBoard";
import { useApi } from "@/lib/api";
import { endingText } from "@/lib/chess";
import type { LobbyStats, Profile } from "@/lib/types";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function Home() {
  const api = useApi();
  const { user, isLoaded, isSignedIn } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lobby, setLobby] = useState<LobbyStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Player search (debounced: wait 500ms after the last keystroke before calling the API)
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);

  useEffect(() => {
    if (!user?.username) return;
    let cancelled = false;
    api
      .get<Profile>(`/api/users/${encodeURIComponent(user.username)}`)
      .then((res) => !cancelled && setProfile(res.data))
      .catch(() => !cancelled && setError("Couldn't load your profile."));
    api
      .get<LobbyStats>("/api/stats")
      .then((res) => !cancelled && setLobby(res.data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, user?.username]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      return;
    }
    let cancelled = false; // ignore out-of-order responses
    api
      .get<string[]>("/api/users/search", { params: { q: debouncedQuery } })
      .then((res) => !cancelled && setSearchResults(res.data))
      .catch(() => !cancelled && setSearchResults([]));
    return () => {
      cancelled = true;
    };
  }, [api, debouncedQuery]);

  const last = profile?.recentGames[0];

  const cta =
    "inline-flex h-12 items-center justify-center rounded-md px-7 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-12">
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
        <div>
          <h1 className="display text-6xl sm:text-7xl">Your move.</h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Rated 10-minute chess against players near your rating. Every game feeds the leaderboard and the explorer.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {isSignedIn ? (
              <Link href="/play" className={`${cta} bg-primary text-primary-foreground hover:bg-primary/90`}>
                Play a rated game
              </Link>
            ) : (
              isLoaded && (
                <>
                  <SignUpButton>
                    <button className={`${cta} bg-primary text-primary-foreground hover:bg-primary/90`}>Create an account</button>
                  </SignUpButton>
                  <SignInButton>
                    <button className={`${cta} border bg-card hover:bg-accent`}>Log in</button>
                  </SignInButton>
                </>
              )
            )}
            {isSignedIn && (
              <Link href="/bot" className={`${cta} border bg-card hover:bg-accent`}>
                Play the computer
              </Link>
            )}
          </div>

          {lobby && (
            <p className="num mt-6 text-sm text-muted-foreground">
              {lobby.playing} {lobby.playing === 1 ? "game" : "games"} in progress · {lobby.waiting} waiting for an opponent
            </p>
          )}
        </div>

        <figure className="mx-auto w-full max-w-md">
          <MiniBoard fen={last?.finalFen ?? START_FEN} orientation={last?.playedAs ?? "white"} className="max-w-none shadow-sm" />
          <figcaption className="mt-3 text-sm text-muted-foreground">
            {last ? (
              <>
                Your last game, vs <span className="font-medium text-foreground">{last.opponent}</span>: {endingText(last.reason, last.outcome).toLowerCase()}.
              </>
            ) : (
              "The starting position. Nothing has been played yet."
            )}
          </figcaption>
        </figure>
      </section>

      {error && <p className="text-center text-loss">{error}</p>}

      {isSignedIn && user && (
        <PlayerPage
          user={{ username: user.username ?? "", rating: profile?.rating ?? 1200, profilePhoto: user.imageUrl }}
          recentGames={profile?.recentGames ?? []}
          stats={profile?.stats ?? { wins: 0, draws: 0, losses: 0 }}
          totalGames={profile?.gamesPlayed ?? 0}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
          self
        />
      )}
    </main>
  );
}
