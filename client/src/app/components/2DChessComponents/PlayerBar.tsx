import { formatClock } from "@/lib/chess";
import { cn } from "@/lib/utils";

interface PlayerBarProps {
  username: string;
  rating?: number | null;
  clockMs: number | null;
  active: boolean; // this side's clock is the one running
  away?: boolean;
}

export default function PlayerBar({ username, rating, clockMs, active, away }: PlayerBarProps) {
  const low = clockMs !== null && clockMs < 30_000;
  return (
    <div className="flex items-center justify-between py-2" style={{ width: "min(92vw, 70vh, 640px)" }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", away ? "bg-loss" : "bg-win")}
          title={away ? "Disconnected" : "Online"}
        />
        <span className="truncate font-semibold">{username}</span>
        {rating != null && <span className="num text-sm text-muted-foreground">{rating}</span>}
        {away && <span className="text-xs text-loss">disconnected</span>}
      </div>
      {clockMs !== null && (
        <span
          className={cn(
            "num min-w-[5.5rem] rounded-md px-3 py-1.5 text-center text-2xl font-medium transition-colors",
            active ? (low ? "bg-loss text-white" : "bg-ink text-white") : "bg-muted text-muted-foreground"
          )}
          aria-label="Clock"
        >
          {formatClock(clockMs)}
        </span>
      )}
    </div>
  );
}
