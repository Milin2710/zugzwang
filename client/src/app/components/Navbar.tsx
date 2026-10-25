"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { BookOpen, Bot, History, Menu, Palette, Play, Trophy, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useUserData } from "../contexts/UserDataContext";
import { cn } from "@/lib/utils";

const NAV = [
  { name: "Play", href: "/play", icon: Play },
  { name: "Computer", href: "/bot", icon: Bot },
  { name: "Explorer", href: "/explorer", icon: BookOpen },
  { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { name: "Games", href: "/games", icon: History },
];

const THEME_SWATCH: Record<string, string> = {
  pink: "#d387ab",
  blue: "#1e90ff",
  yellow: "#ffae42",
  green: "#32cd32",
  gray: "#7f8c8d",
};

export default function Navbar() {
  const { theme, changetheme } = useTheme();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { userData } = useUserData();
  const { isSignedIn, user } = useUser();

  const rating = userData?.rating;
  const username = userData?.username ?? user?.username;

  const link = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
      active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
    );

  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60" aria-label="Zugzwang home">
            {/* a 2x2 slice of a board */}
            <span className="grid h-6 w-6 grid-cols-2 grid-rows-2 overflow-hidden rounded-[3px]" aria-hidden>
              <i className="bg-[var(--sq-light)]" />
              <i className="bg-[var(--sq-dark)]" />
              <i className="bg-[var(--sq-dark)]" />
              <i className="bg-[var(--sq-light)]" />
            </span>
            <span className="display text-lg">Zugzwang</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={link(pathname.startsWith(item.href))} aria-current={pathname.startsWith(item.href) ? "page" : undefined}>
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={changetheme}
            className="hidden items-center gap-2 rounded-md px-2.5 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:flex"
            title="Change board colour"
          >
            <span className="h-3.5 w-3.5 rounded-full border border-white/50" style={{ background: THEME_SWATCH[theme] }} />
            Board
          </button>

          {isSignedIn ? (
            <div className="flex items-center gap-3">
              {rating !== undefined && (
                <span className="num hidden rounded-md bg-white/10 px-2 py-1 text-sm sm:inline" title="Your rating">
                  {rating}
                </span>
              )}
              <UserButton />
              <span className="hidden text-sm font-medium lg:block">{username}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <SignInButton>
                <button className="rounded-md px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">Log in</button>
              </SignInButton>
              <SignUpButton>
                <button className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-white/90">Sign up</button>
              </SignUpButton>
            </div>
          )}

          <button
            type="button"
            className="rounded-md p-2 hover:bg-white/10 md:hidden"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-white/10 px-4 py-2 md:hidden" aria-label="Mobile">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={link(pathname.startsWith(item.href))} onClick={() => setOpen(false)}>
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          ))}
          <button type="button" onClick={changetheme} className={cn(link(false), "w-full")}>
            <Palette className="h-4 w-4" />
            Board colour
          </button>
        </nav>
      )}
    </header>
  );
}
