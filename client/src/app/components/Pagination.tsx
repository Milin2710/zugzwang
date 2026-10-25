"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow } from "@/lib/chess";
import { cn } from "@/lib/utils";

interface Props {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
}

const base =
  "num inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

/** Numbered pages with ellipses and prev/next. Renders nothing for a single page. */
export default function Pagination({ page, pages, onChange, disabled, className }: Props) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className={cn("flex flex-wrap items-center justify-center gap-1.5", className)}>
      <button className={cn(base, "bg-card hover:bg-accent")} disabled={disabled || page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pageWindow(page, pages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="num px-1 text-muted-foreground" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={p}
            disabled={disabled}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onChange(p)}
            className={cn(base, p === page ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}
          >
            {p}
          </button>
        )
      )}
      <button className={cn(base, "bg-card hover:bg-accent")} disabled={disabled || page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
