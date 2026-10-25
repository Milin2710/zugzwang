"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@components/ui/avatar";
import { Input } from "@components/ui/input";
import HealthBar from "./HealthBar";
import GameList from "../games/GameList";
import { getSearchHistory, addToSearchHistory } from "@/lib/utils";
import type { GameSummary, UserData } from "@/lib/types";

interface PlayerPageProps {
  user: UserData;
  recentGames: GameSummary[];
  stats: { wins: number; draws: number; losses: number };
  totalGames: number;
  lastOnline?: string | null;
  self: boolean;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  searchResults?: string[];
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

const PlayerPage: React.FC<PlayerPageProps> = ({
  user, recentGames, stats, totalGames, lastOnline, self,
  searchQuery = "", setSearchQuery = () => {}, searchResults = [],
}) => {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(getSearchHistory());
  }, []);

  const handleUserClick = (username: string) => {
    addToSearchHistory(username);
    setHistory(getSearchHistory());
  };

  const userList = (names: string[], title: string) => (
    <div className="mt-4">
      <h3 className="mb-1 text-sm font-medium text-muted-foreground">{title}</h3>
      <ul>
        {names.map((name) => (
          <li key={name} onClick={() => handleUserClick(name)}>
            <Link className="block rounded-md px-2 py-1.5 hover:bg-accent" target="_blank" href={`/profile/${encodeURIComponent(name)}`}>
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[20rem_1fr]">
      <aside className="space-y-8">
        <section>
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={user.profilePhoto} />
              <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{user.username}</h2>
              <p className="num text-3xl font-semibold leading-tight">{user.rating}</p>
            </div>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Games played</dt>
              <dd className="num font-semibold">{totalGames}</dd>
            </div>
            <div>
              <dt className="mb-1.5 text-muted-foreground">Results</dt>
              <dd>
                <HealthBar win={pct(stats.wins, totalGames)} loss={pct(stats.losses, totalGames)} draw={pct(stats.draws, totalGames)} />
              </dd>
            </div>
            {!self && <div className="text-muted-foreground">Last online {lastOnline ?? "never"}</div>}
          </dl>
        </section>

        {self && (
          <section>
            <h2 className="mb-2 font-semibold">Find a player</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Username" className="bg-card pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            {searchResults.length > 0
              ? userList(searchResults, "Results")
              : history.length > 0 && userList(history, "Recent searches")}
          </section>
        )}
      </aside>

      <section className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Recent games</h2>
          {self && (
            <Link href="/games" className="text-sm font-medium underline-offset-4 hover:underline">
              All games
            </Link>
          )}
        </div>
        <GameList games={recentGames} />
      </section>
    </div>
  );
};

export default PlayerPage;
