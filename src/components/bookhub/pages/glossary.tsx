"use client";

/* ------------------------------------------------------------------ *
 * Glossary — the made-up words of the world.
 *
 * Table view: Term · Definition · Related card · First use chapter.
 * Inline add-form row sits between the column header and the data
 * rows (no modal). Search filters by term or definition. Two sort
 * modes: Term A-Z (default) and First use (by chapter number).
 *
 * Persistence: loadStore on mount → local state → saveStore on every
 * change (debounced by mock-store) → flushSave on unmount.
 * ------------------------------------------------------------------ */

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bot, Plus, Search, Trash2 } from "lucide-react";
import { useRouter, type BibleTab } from "../router";
import { type Chapter, type GlossaryTerm, type LoreCard } from "@/lib/data-client";
import { useGlossaryTerms, useChapters, useCards, useCreateGlossaryTerm, useDeleteGlossaryTerm, useUpdateGlossaryTerm, LoadingSpinner } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Category → label/tab maps (only used for related-card navigation)
 * ------------------------------------------------------------------ */
const CATEGORY_LABEL: Record<LoreCard["category"], string> = {
  magic: "Magic",
  cosmology: "Cosmology",
  geography: "Geography",
  factions: "Factions",
  history: "History",
  bestiary: "Bestiary",
  character: "Cast",
};

const CATEGORY_TO_TAB: Partial<Record<LoreCard["category"], BibleTab>> = {
  magic: "magic",
  cosmology: "cosmology",
  geography: "geography",
  factions: "factions",
  history: "history",
  bestiary: "bestiary",
};

type SortMode = "alpha" | "first-use";

const GRID_COLS = "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_1.5fr_minmax(11rem,1fr)] sm:gap-4";

export function GlossaryPage({ bookId, aiDock }: { bookId: string; aiDock?: { openWith: (scope: string, data?: { bookId?: string; tab?: string }) => void } }) {
  const { navigate } = useRouter();

  /* ----- hydrate from API ----- */
  const { data: termsData, isLoading } = useGlossaryTerms(bookId);
  const { data: chaptersData } = useChapters(bookId);
  const { data: cardsData } = useCards(bookId);
  const createTerm = useCreateGlossaryTerm();
  const deleteTerm = useDeleteGlossaryTerm();
  const updateTerm = useUpdateGlossaryTerm();
  const [editingId, setEditingId] = useState<string | null>(null);

  const terms = termsData ?? [];
  const bookChapters = chaptersData ?? [];
  const bookCards = cardsData ?? [];

  /* ----- derived lookups ----- */
  const cardById = useMemo<Map<string, LoreCard>>(
    () => new Map(bookCards.map((c) => [c.id, c])),
    [bookCards],
  );

  const chapterById = useMemo<Map<string, Chapter>>(
    () => new Map(bookChapters.map((c) => [c.id, c])),
    [bookChapters],
  );

  /* ----- UI state ----- */
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alpha");

  /* ----- add-form state ----- */
  const [newTerm, setNewTerm] = useState("");
  const [newDef, setNewDef] = useState("");
  const [newCardQuery, setNewCardQuery] = useState("");
  const [newCardId, setNewCardId] = useState<string | null>(null);
  const [newChapterId, setNewChapterId] = useState<string>("");

  const cardSuggestions = useMemo<LoreCard[]>(() => {
    const q = newCardQuery.trim().toLowerCase();
    if (!q || newCardId) return [];
    return bookCards
      .filter((c) => c.title.toLowerCase().includes(q))
      .slice(0, 5);
  }, [newCardQuery, newCardId, bookCards]);

  /* ----- derived: filtered + sorted list ----- */
  const filtered = useMemo<GlossaryTerm[]>(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? terms.filter(
          (g) =>
            g.term.toLowerCase().includes(q) ||
            g.definition.toLowerCase().includes(q),
        )
      : [...terms];

    if (sortMode === "alpha") {
      list.sort((a, b) => a.term.localeCompare(b.term));
    } else {
      // first-use: by chapter number (unknown → last), then by term
      list.sort((a, b) => {
        const ca = a.firstUseChapterId ? chapterById.get(a.firstUseChapterId) : null;
        const cb = b.firstUseChapterId ? chapterById.get(b.firstUseChapterId) : null;
        if (ca && cb) {
          return ca.number - cb.number || a.term.localeCompare(b.term);
        }
        if (ca && !cb) return -1;
        if (!ca && cb) return 1;
        return a.term.localeCompare(b.term);
      });
    }
    return list;
  }, [terms, search, sortMode, chapterById]);

  /* ----- handlers ----- */
  if (isLoading) return <LoadingSpinner />;

  const handleAdd = () => {
    const t = newTerm.trim();
    const d = newDef.trim();
    if (!t || !d) return;

    // If user typed a title without selecting from the dropdown,
    // try to resolve by exact (case-insensitive) title match.
    let relatedCardId = newCardId ?? undefined;
    if (!relatedCardId && newCardQuery.trim()) {
      const match = bookCards.find(
        (c) =>
          c.bookId === bookId &&
          c.title.toLowerCase() === newCardQuery.trim().toLowerCase(),
      );
      relatedCardId = match?.id;
    }

    createTerm.mutate({
      bookId,
      input: {
        term: t,
        definition: d,
        relatedCardId: relatedCardId ?? null,
        firstUseChapterId: newChapterId || null,
      },
    });

    // reset form
    setNewTerm("");
    setNewDef("");
    setNewCardQuery("");
    setNewCardId(null);
    setNewChapterId("");
  };

  const navigateToCard = (card: LoreCard) => {
    if (card.category === "character") {
      navigate({ name: "cast", bookId, focusCardId: card.id });
      return;
    }
    const tab = CATEGORY_TO_TAB[card.category];
    if (tab) navigate({ name: "world", bookId, tab, focusCardId: card.id });
  };

  const canAdd = newTerm.trim().length > 0 && newDef.trim().length > 0;
  const noTermsAtAll = terms.length === 0;

  return (
    <div className="mx-auto max-w-5xl p-6 sm:p-8">
      {/* header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Glossary</h1>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            The made-up words of your world.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* sort toggle */}
          <div className="flex overflow-hidden rounded-md border border-border text-xs">
            <button
              type="button"
              onClick={() => setSortMode("alpha")}
              className={cn(
                "px-2.5 py-1.5 font-medium transition-colors",
                sortMode === "alpha"
                  ? "bg-accent text-accent-foreground"
                  : "bg-background text-[var(--text-2)] hover:bg-[var(--surface-2)]",
              )}
            >
              Term A-Z
            </button>
            <button
              type="button"
              onClick={() => setSortMode("first-use")}
              className={cn(
                "border-l border-border px-2.5 py-1.5 font-medium transition-colors",
                sortMode === "first-use"
                  ? "bg-accent text-accent-foreground"
                  : "bg-background text-[var(--text-2)] hover:bg-[var(--surface-2)]",
              )}
            >
              First use
            </button>
          </div>
          {/* search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search terms…"
              className="h-9 w-full rounded-md border border-border bg-card pl-8 pr-3 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none sm:w-64"
            />
          </div>
          {/* AI button */}
          {aiDock && (
            <button
              onClick={() => aiDock.openWith(`Glossary · ${terms.length} term${terms.length !== 1 ? "s" : ""}`, { bookId, tab: "glossary" })}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
              aria-label="AI"
              title="AI"
            >
              <Bot className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-lg border border-border">
        {/* column header */}
        <div
          className={cn(
            GRID_COLS,
            "items-center border-b border-border bg-[var(--surface-2)] px-4 py-2 text-[11px] uppercase tracking-wide text-[var(--text-3)]",
          )}
        >
          <div>Term</div>
          <div>Definition</div>
          <div>Related</div>
          <div>First use</div>
        </div>

        {/* add-form row */}
        <div
          className={cn(
            GRID_COLS,
            "items-start border-b border-border bg-background px-4 py-3",
          )}
        >
          <input
            type="text"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            placeholder="New term…"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            value={newDef}
            onChange={(e) => setNewDef(e.target.value)}
            placeholder="Definition…"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
          />
          {/* related-card input with typeahead dropdown */}
          <div className="relative">
            <input
              type="text"
              value={newCardQuery}
              onChange={(e) => {
                setNewCardQuery(e.target.value);
                setNewCardId(null);
              }}
              placeholder="Related card (optional)…"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
            />
            {cardSuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
                {cardSuggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setNewCardQuery(c.title);
                      setNewCardId(c.id);
                    }}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                  >
                    <span className="truncate text-sm text-foreground">{c.title}</span>
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">
                      {CATEGORY_LABEL[c.category]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* chapter select + add button */}
          <div className="flex items-center gap-2">
            <select
              value={newChapterId}
              onChange={(e) => setNewChapterId(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:border-accent focus:outline-none"
            >
              <option value="">No chapter</option>
              {bookChapters.map((c) => (
                <option key={c.id} value={c.id}>
                  Ch.{c.number} — {c.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd}
              className="flex h-9 shrink-0 items-center gap-1 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        {/* rows OR empty state */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-3)]">
            {noTermsAtAll
              ? "No terms yet — the made-up words of your world live here. Add the first one."
              : `No terms match ‘${search}’.`}
          </div>
        ) : (
          filtered.map((g) => {
            const card = g.relatedCardId ? cardById.get(g.relatedCardId) : undefined;
            const ch = g.firstUseChapterId ? chapterById.get(g.firstUseChapterId) : undefined;
            const isEditing = editingId === g.id;
            return (
              <div
                key={g.id}
                className={cn(
                  GRID_COLS,
                  "group items-start border-b border-border px-4 py-3 transition-colors hover:bg-[var(--surface-2)]",
                )}
              >
                {/* Term — inline editable */}
                {isEditing ? (
                  <input
                    defaultValue={g.term}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== g.term) {
                        updateTerm.mutate({ id: g.id, updates: { term: e.target.value.trim() } });
                      }
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="rounded border border-accent bg-background px-2 py-1 text-sm font-medium text-foreground focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setEditingId(g.id)}
                    className="text-left text-sm font-medium text-foreground hover:text-accent"
                  >
                    {g.term}
                  </button>
                )}
                {/* Definition — inline editable */}
                {isEditing ? (
                  <input
                    defaultValue={g.definition}
                    onBlur={(e) => {
                      if (e.target.value !== g.definition) {
                        updateTerm.mutate({ id: g.id, updates: { definition: e.target.value } });
                      }
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="rounded border border-accent bg-background px-2 py-1 text-sm text-foreground focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setEditingId(g.id)}
                    className="line-clamp-2 text-left text-sm text-[var(--text-2)] hover:text-foreground"
                  >
                    {g.definition || <span className="text-[var(--text-3)] italic">No definition — click to add</span>}
                  </button>
                )}
                <div className="text-sm">
                  {card ? (
                    <button
                      type="button"
                      onClick={() => navigateToCard(card)}
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      <span className="truncate">{card.title}</span>
                      <ArrowUpRight className="h-3 w-3 shrink-0" />
                      <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">
                        {CATEGORY_LABEL[card.category]}
                      </span>
                    </button>
                  ) : (
                    <span className="text-[var(--text-3)]">—</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {ch ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ name: "editor", bookId, chapterId: ch.id })
                      }
                      className="text-accent hover:underline"
                    >
                      Ch.{ch.number} — {ch.title}
                    </button>
                  ) : (
                    <span className="text-[var(--text-3)]">—</span>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${g.term}"?`)) deleteTerm.mutate(g.id);
                    }}
                    className="opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                    title="Delete term"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
