"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, ArrowUpRight } from "lucide-react";
import type { LoreCard } from "@/lib/data-client";
import type { BibleTab } from "../router";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * BibleSearchOverlay — ⌘F/Ctrl+F fuzzy search across all cards in a book.
 * Grouped by category, Enter jumps to tab + centers on card.
 * ------------------------------------------------------------------ */

const CATEGORY_LABEL: Record<string, string> = {
  magic: "Magic Systems",
  cosmology: "Cosmology",
  geography: "Geography",
  factions: "Factions",
  history: "History",
  bestiary: "Bestiary",
  character: "Cast",
};

const CATEGORY_TO_TAB: Record<string, BibleTab> = {
  magic: "magic",
  cosmology: "cosmology",
  geography: "geography",
  factions: "factions",
  history: "history",
  bestiary: "bestiary",
};

export function BibleSearchOverlay({
  cards,
  onClose,
  onJump,
}: {
  cards: LoreCard[];
  onClose: () => void;
  onJump: (card: LoreCard) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter cards by query (title + summary + body + tags)
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return cards
      .filter((c) =>
        c.title.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        c.body.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [cards, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, LoreCard[]> = {};
    for (const card of results) {
      if (!groups[card.category]) groups[card.category] = [];
      groups[card.category].push(card);
    }
    return groups;
  }, [results]);

  // Flat list for keyboard navigation
  const flatResults = results;

  // Keyboard handling
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatResults[selectedIndex]) {
          onJump(flatResults[selectedIndex]);
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [flatResults, selectedIndex, onClose, onJump]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  let runningIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* search input */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-[var(--text-3)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            placeholder="Search all cards…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-[var(--text-3)] focus:outline-none"
          />
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-[var(--text-3)]">
            ESC
          </kbd>
        </div>

        {/* results */}
        <div className="bh-scroll max-h-[60vh] overflow-y-auto">
          {query.trim() === "" ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-3)]">
              Type to search across all cards in this book.
            </div>
          ) : flatResults.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-3)]">
              No cards match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            Object.entries(grouped).map(([category, catCards]) => (
              <div key={category}>
                {/* category header */}
                <div className="sticky top-0 border-b border-border bg-[var(--surface-2)] px-4 py-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--text-3)]">
                  {CATEGORY_LABEL[category] ?? category}
                </div>
                {/* cards */}
                {catCards.map((card) => {
                  const idx = runningIndex++;
                  return (
                    <button
                      key={card.id}
                      onClick={() => onJump(card)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        selectedIndex === idx
                          ? "bg-accent/10"
                          : "hover:bg-[var(--surface-2)]",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {card.title}
                        </div>
                        {card.summary && (
                          <div className="truncate text-xs text-[var(--text-3)]">
                            {card.summary}
                          </div>
                        )}
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-[var(--text-3)]">
          <span>
            {flatResults.length} result{flatResults.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ jump</span>
          </div>
        </div>
      </div>
    </div>
  );
}
