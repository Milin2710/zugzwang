"use client";

import PlayerPage from "@/app/components/indexComponents/PlayerPage";
import { useApi } from "@/lib/api";
import type { Profile as ProfileData } from "@/lib/types";
import { use, useEffect, useState } from "react";

export default function Profile({ params }: { params: Promise<{ user: string }> }) {
  const { user } = use(params);
  const username = decodeURIComponent(user);
  const api = useApi();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ProfileData>(`/api/users/${encodeURIComponent(username)}`)
      .then((res) => !cancelled && setProfile(res.data))
      .catch(() => !cancelled && setNotFound(true));
    return () => {
      cancelled = true;
    };
  }, [api, username]);

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="display text-4xl">No such player</h1>
        <p className="mt-3 text-muted-foreground">There is no player called “{username}”. Check the spelling and try again.</p>
      </main>
    );
  }

  return (
    <div>
      <main className="mx-auto max-w-6xl px-4 py-10">
        {profile ? (
          <PlayerPage
            user={{ username: profile.username, rating: profile.rating, profilePhoto: profile.profilePhoto }}
            recentGames={profile.recentGames}
            stats={profile.stats}
            totalGames={profile.gamesPlayed}
            lastOnline={new Date(profile.lastOnline).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            self={false}
          />
        ) : (
          <p className="text-muted-foreground">Loading…</p>
        )}
      </main>
    </div>
  );
}
