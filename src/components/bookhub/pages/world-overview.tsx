"use client";

/* ------------------------------------------------------------------ *
 * World Overview — front door to the World Bible.
 * Read-only dashboard for the whole worldbuilding graph.
 *
 * Route: #/b/:id/world  (no tab)
 *
 * Layout (top → bottom):
 *   1. World Summary card (editable title + body, session state only)
 *   2. Category tiles (7 bible tabs, with canon/draft counts)
 *   3. World graph — React Flow read-only minimap of ALL cards/links
 *   4. Recent edits list
 *   5. Orphan cards flag (only when orphans exist)
 * ------------------------------------------------------------------ */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  MarkerType,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { BIBLE_TABS, useRouter, type BibleTab } from "../router";
import type { CanonStatus, LoreCard } from "@/lib/data-client";
import { useCards, useLinks, useGlossaryTerms, useBook, useUpdateBook, LoadingSpinner } from "@/lib/hooks";

/* ------------------------------------------------------------------ *
 * Constants — fixed color per card category (used on minimap nodes).
 * These are inline-styled, NOT Tailwind classes, to avoid leaking
 * indigo/blue/violet into the design system's var-only palette.
 * ------------------------------------------------------------------ */
const CATEGORY_COLOR: Record<LoreCard["category"], string> = {
  magic: "#818cf8",
  cosmology: "#a78bfa",
  geography: "#34d399",
  factions: "#f87171",
  history: "#fbbf24",
  bestiary: "#9b9ba4",
  character: "#60a5fa",
};

type MiniNodeData = { card: LoreCard };
type MiniNodeType = Node<MiniNodeData, "mini">;
type MiniEdgeType = Edge;

/* ------------------------------------------------------------------ *
 * MiniNode — read-only React Flow node, simplified card.
 * Title-only (no body). 3px left border = category color.
 * ------------------------------------------------------------------ */
function MiniNode({ data }: NodeProps<MiniNodeType>) {
  const { card } = data;
  return (
    <div
      className="w-[120px] cursor-pointer rounded border border-border bg-background p-2 text-[11px] transition-colors hover:border-accent/60"
      style={{ borderLeft: `3px solid ${CATEGORY_COLOR[card.category]}` }}
      title={card.title}
    >
      <div className="truncate font-medium text-foreground">{card.title}</div>
    </div>
  );
}

const nodeTypes = { mini: MiniNode };

/* ------------------------------------------------------------------ *
 * StatusBadge — small text-based canon/draft/deprecated indicator.
 *   canon      → muted "canon"
 *   draft      → amber "draft"
 *   deprecated → muted strike-through "deprecated"
 * Mirrors the canvas convention (canon is silent on the canvas).
 * ------------------------------------------------------------------ */
function StatusBadge({ status }: { status: CanonStatus }) {
  if (status === "canon") {
    return (
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">
        canon
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="text-[10px] uppercase tracking-wide text-[var(--draft)]">
        draft
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)] line-through">
      deprecated
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */
export function WorldOverview({ bookId }: { bookId: string }) {
  const { navigate } = useRouter();

  /* ----- hydrate from API via hooks ----- */
  const { data: book } = useBook(bookId);
  const { data: cardsData, isLoading: cardsLoading } = useCards(bookId);
  const { data: linksData } = useLinks(bookId);
  const { data: glossaryData } = useGlossaryTerms(bookId);

  const cards = cardsData ?? [];
  const links = linksData ?? [];
  const glossaryCount = glossaryData?.length ?? 0;
  const bookTitle = book?.title;

  /* ----- category counts (one bucket per bible tab) ----- */
  // Characters are surfaced on the Cast page, not as a tile — skip them.
  // Glossary bucket comes from glossaryTerms (terms have no status field).
  const categoryCounts = useMemo(() => {
    const map: Record<string, { total: number; canon: number; draft: number }> = {};
    for (const tab of BIBLE_TABS) {
      map[tab.id] = { total: 0, canon: 0, draft: 0 };
    }
    for (const card of cards) {
      if (card.category === "character") continue;
      const bucket = map[card.category];
      if (!bucket) continue;
      bucket.total += 1;
      if (card.status === "canon") bucket.canon += 1;
      else bucket.draft += 1; // draft or deprecated
    }
    map["glossary"] = {
      total: glossaryCount,
      canon: glossaryCount,
      draft: 0,
    };
    return map;
  }, [cards, glossaryCount]);

  /* ----- orphan cards (no links reference them) ----- */
  const orphanCards = useMemo<LoreCard[]>(() => {
    const connected = new Set<string>();
    for (const l of links) {
      connected.add(l.source);
      connected.add(l.target);
    }
    return cards.filter((c) => !connected.has(c.id));
  }, [cards, links]);

  /* ----- recent edits (no timestamps on cards — first 5 from array) ----- */
  const recentCards = useMemo(() => cards.slice(0, 5), [cards]);

  /* ----- minimap navigation ----- */
  // Characters → Cast page; everything else → that card's bible tab w/ focus.
  const handleNodeSelect = useCallback(
    (id: string) => {
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      if (card.category === "character") {
        navigate({ name: "cast", bookId, focusCardId: card.id });
      } else {
        navigate({
          name: "world",
          bookId,
          tab: card.category,
          focusCardId: card.id,
        });
      }
    },
    [cards, navigate, bookId],
  );

  /* ----- minimap nodes + edges (all cards, all links) ----- */
  const nodes = useMemo<MiniNodeType[]>(
    () =>
      cards.map((c) => ({
        id: c.id,
        type: "mini",
        position: { x: c.x, y: c.y },
        data: { card: c },
        draggable: false,
        connectable: false,
      })),
    [cards],
  );

  const edges = useMemo<MiniEdgeType[]>(() => {
    const ids = new Set(cards.map((c) => c.id));
    return links
      .filter((l) => ids.has(l.source) && ids.has(l.target))
      .map<MiniEdgeType>((l) => ({
        id: l.id,
        source: l.source,
        target: l.target,
        type: "default",
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#3f3f47" },
      }));
  }, [cards, links]);

  /* ----- editable summary state, hydrated from the book, debounce-saved ----- */
  const updateBook = useUpdateBook();
  const [summaryTitle, setSummaryTitle] = useState<string>("");
  const [summaryBody, setSummaryBody] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  if (book && !hydrated) {
    setSummaryTitle(book.worldSummaryTitle ?? (book.title ? `${book.title} — World Bible` : "World Bible"));
    setSummaryBody(book.worldSummaryBody ?? "");
    setHydrated(true);
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback(
    (patch: { worldSummaryTitle?: string; worldSummaryBody?: string }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateBook.mutate({ id: bookId, updates: patch });
      }, 800);
    },
    [bookId, updateBook],
  );

  /* ----- tile click → that bible tab ----- */
  const handleTileClick = useCallback(
    (tabId: BibleTab) => {
      navigate({ name: "world", bookId, tab: tabId });
    },
    [navigate, bookId],
  );

  if (cardsLoading) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
      {/* 1. World Summary card */}
      <section className="rounded-lg border border-border bg-card p-6">
        <input
          value={summaryTitle}
          onChange={(e) => {
            setSummaryTitle(e.target.value);
            scheduleSave({ worldSummaryTitle: e.target.value });
          }}
          placeholder="World Bible"
          aria-label="World Bible title"
          className="w-full bg-transparent text-2xl font-serif font-semibold text-foreground focus:outline-none"
        />
        <textarea
          value={summaryBody}
          onChange={(e) => {
            setSummaryBody(e.target.value);
            scheduleSave({ worldSummaryBody: e.target.value });
          }}
          placeholder="Describe your world in a few sentences…"
          aria-label="World summary"
          rows={6}
          className="mt-3 w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--text-2)] focus:outline-none"
        />
      </section>

      {/* 2. Category tiles */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {BIBLE_TABS.map((tab) => {
          const counts = categoryCounts[tab.id] ?? {
            total: 0,
            canon: 0,
            draft: 0,
          };
          return (
            <button
              key={tab.id}
              onClick={() => handleTileClick(tab.id)}
              className="group flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-accent/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {tab.label}
                </span>
                <ChevronRight className="h-4 w-4 text-[var(--text-3)] transition-colors group-hover:text-accent" />
              </div>
              <div className="text-2xl font-semibold text-foreground">
                {counts.total}
              </div>
              <div className="text-xs text-[var(--text-3)]">
                {tab.id === "glossary"
                  ? `${counts.total} term${counts.total === 1 ? "" : "s"}`
                  : `${counts.canon} canon · ${counts.draft} draft`}
              </div>
            </button>
          );
        })}
      </section>

      {/* 3. World graph — React Flow read-only minimap */}
      <section>
        <h2 className="mb-3 px-1 text-sm font-semibold text-foreground">
          World graph
        </h2>
        <div className="relative h-[320px] overflow-hidden rounded-lg border border-border bg-card">
          <ReactFlow<MiniNodeType, MiniEdgeType>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_e, node) => handleNodeSelect(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            panOnDrag
            zoomOnScroll
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="rgba(255,255,255,0.1)"
              gap={24}
              size={1}
            />
            <Controls position="bottom-left" />
            <MiniMap position="bottom-right" pannable />
          </ReactFlow>
        </div>
      </section>

      {/* 4. Recent edits list */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Recent edits
        </h2>
        {recentCards.length === 0 ? (
          <p className="text-xs text-[var(--text-2)]">No cards yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recentCards.map((card) => (
              <li
                key={card.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <button
                  onClick={() => handleNodeSelect(card.id)}
                  className="flex-1 truncate text-left text-xs text-[var(--text-2)] hover:text-foreground"
                >
                  {card.title}
                </button>
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">
                  {card.category}
                </span>
                <StatusBadge status={card.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 5. Orphan cards flag (only if orphans exist) */}
      {orphanCards.length > 0 && (
        <section className="rounded-lg border border-[var(--draft)]/30 bg-[var(--draft)]/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--draft)]" />
            <h2 className="text-sm font-semibold text-foreground">Orphan cards</h2>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-[var(--text-3)]">
              {orphanCards.length}
            </span>
          </div>
          <p className="mb-3 text-xs text-[var(--text-2)]">
            These cards have no connections. Consider linking them to related cards.
          </p>
          <ul className="space-y-1">
            {orphanCards.map((card) => (
              <li key={card.id}>
                <button
                  onClick={() => handleNodeSelect(card.id)}
                  className="text-left text-xs text-[var(--text-2)] hover:text-foreground"
                >
                  {card.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
