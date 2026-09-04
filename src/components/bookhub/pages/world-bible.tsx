"use client";

/* ------------------------------------------------------------------ *
 * World Bible canvas — UX pass 2.
 * React Flow infinite canvas with drag-to-connect, multi-path delete,
 * progressive-disclosure drawer, coach layer, and localStorage-backed
 * persistence (interim, until Prisma backend lands).
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  LayoutGrid,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BIBLE_TABS, useRouter, type BibleTab } from "../router";
import { useAiDock, AiDock } from "../ai-dock";
import { BibleSearchOverlay } from "../bible-search";
import {
  type CanonStatus,
  type CardLink,
  type LoreCard,
} from "@/lib/data-client";
import { useCards, useLinks, useCreateCard, useUpdateCard, useDeleteCard, useCreateLink, useDeleteLink } from "@/lib/hooks";
import { WorldOverview } from "./world-overview";
import { GlossaryPage } from "./glossary";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */
type LoreNodeData = {
  card: LoreCard;
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
};
type LoreNodeType = Node<LoreNodeData, "lore">;
type EdgeType = Edge;

type PageProps = {
  bookId: string;
  tab?: BibleTab;
  focusCardId?: string;
  aiDock?: ReturnType<typeof useAiDock>;
};

// The canvas/grid/timeline views only ever render for a concrete,
// non-glossary tab — WorldBiblePage narrows to this before rendering them.
type CanvasTab = Exclude<BibleTab, "glossary">;
type CanvasPageProps = {
  bookId: string;
  tab: CanvasTab;
  focusCardId?: string;
  aiDock?: ReturnType<typeof useAiDock>;
};

/* ------------------------------------------------------------------ *
 * Status / category label maps
 * ------------------------------------------------------------------ */
const STATUS_LABEL: Record<CanonStatus, string> = {
  canon: "Canon",
  draft: "Draft",
  deprecated: "Deprecated",
};

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

/* ------------------------------------------------------------------ *
 * Custom CSS — link-handle hover + tidy transition.
 * Scoped under class hooks so we don't fight globals.css.
 * ------------------------------------------------------------------ */
const CANVAS_CSS = `
.bh-link-handle {
  width: 8px !important;
  height: 8px !important;
  background: var(--border) !important;
  border: none !important;
  cursor: crosshair !important;
  opacity: 0;
  transition: opacity 120ms ease-out, background 120ms ease-out;
}
.bh-link-handle:hover {
  background: var(--accent) !important;
  opacity: 1;
}
.react-flow__node:hover .bh-link-handle,
.react-flow__node.bh-node-selected .bh-link-handle {
  opacity: 1;
}
.bh-tidying .react-flow__node {
  transition: transform 280ms ease-out;
}
`;

/* ------------------------------------------------------------------ *
 * LoreNode — custom React Flow node rendering a LoreCard.
 * Hover reveals four link handles + a small × delete button.
 * Canon = silent (no badge). Draft = small amber "DRAFT".
 * Deprecated = whole card dimmed + line-through title.
 * ------------------------------------------------------------------ */
function LoreNode({ data, selected }: NodeProps<LoreNodeType>) {
  const { card, onSelect, onRequestDelete } = data;
  const deprecated = card.status === "deprecated";
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelect(card.id);
      }}
      className={cn(
        "group relative w-[240px] cursor-pointer rounded-lg border bg-card p-4 transition-colors",
        selected ? "border-accent" : "border-border hover:bg-[var(--surface-2)]",
        deprecated && "opacity-60",
      )}
    >
      {/* four link handles — hidden by default, appear on hover */}
      <Handle
        id="t"
        type="target"
        position={Position.Top}
        className="bh-link-handle"
        title="Drag to another card to link"
      />
      <Handle
        id="b"
        type="source"
        position={Position.Bottom}
        className="bh-link-handle"
        title="Drag to another card to link"
      />
      <Handle
        id="l"
        type="target"
        position={Position.Left}
        className="bh-link-handle"
        title="Drag to another card to link"
      />
      <Handle
        id="r"
        type="source"
        position={Position.Right}
        className="bh-link-handle"
        title="Drag to another card to link"
      />

      {/* top-right cluster: status badge (silent for canon) + × delete */}
      <div className="absolute right-2 top-2 flex items-center gap-1.5">
        {card.status === "draft" && (
          <span className="text-[10px] uppercase tracking-wide text-[var(--draft)]">
            DRAFT
          </span>
        )}
        {card.status === "deprecated" && (
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">
            deprecated
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete(card.id);
          }}
          className="rounded p-0.5 text-[var(--text-3)] opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          aria-label="Delete card"
          title="Delete card"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <h3
        className={cn(
          "pr-16 text-sm font-semibold text-foreground",
          deprecated && "line-through",
        )}
      >
        {card.title}
      </h3>
      {card.summary && (
        <p className="mt-1 line-clamp-2 text-xs text-[var(--text-2)]">
          {card.summary}
        </p>
      )}
      {card.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {card.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-[var(--text-3)]"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { lore: LoreNode };

/* ------------------------------------------------------------------ *
 * Tab bar — 6 bible tabs + Tidy + New-card buttons.
 * ------------------------------------------------------------------ */
function TabBar({
  active,
  onTab,
  onNew,
  onTidy,
  onAi,
}: {
  active: BibleTab;
  onTab: (t: BibleTab) => void;
  onNew: () => void;
  onTidy: () => void;
  onAi: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-3">
      <div className="bh-scroll flex flex-1 items-center overflow-x-auto">
        {BIBLE_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              "relative whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
              active === t.id ? "text-accent" : "text-[var(--text-2)] hover:text-foreground",
            )}
          >
            {t.label}
            {active === t.id && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>
      <button
        onClick={onTidy}
        className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
        aria-label="Tidy up layout"
        title="Tidy up layout"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        onClick={onNew}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
        aria-label="New card"
        title="New card"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        onClick={onAi}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
        aria-label="AI"
        title="AI"
      >
        <Bot className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * History timeline strip — history tab only.
 * ------------------------------------------------------------------ */
function HistoryStrip({
  cards,
  selectedId,
  onSelect,
}: {
  cards: LoreCard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
        Timeline
      </div>
      <div className="bh-scroll flex items-center gap-0 overflow-x-auto">
        {cards.map((c, i) => (
          <div key={c.id} className="flex items-center">
            <button
              onClick={() => onSelect(c.id)}
              className="group flex flex-col items-center gap-1.5 px-3"
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full border transition-colors",
                  selectedId === c.id
                    ? "border-accent bg-accent"
                    : "border-border bg-card group-hover:border-accent",
                )}
              />
              <span
                className={cn(
                  "max-w-[110px] truncate text-[11px] transition-colors",
                  selectedId === c.id
                    ? "text-foreground"
                    : "text-[var(--text-2)] group-hover:text-foreground",
                )}
              >
                {c.title}
              </span>
            </button>
            {i < cards.length - 1 && <div className="h-px w-6 bg-border" />}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * CollapsibleSection — progressive disclosure helper.
 * ------------------------------------------------------------------ */
function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 py-1 text-left"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 text-[var(--text-3)] transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
          {title}
        </span>
        {count !== undefined && (
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-[var(--text-3)]">
            {count}
          </span>
        )}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Card drawer — right-side detail panel (400px wide).
 * Always-visible: Title, Status segmented control + hint, Summary.
 * Collapsible: Body (open by default), Facts, Tags, Connections.
 * Footer: ✓ Auto-saved + Done + Delete card… link.
 * ------------------------------------------------------------------ */
function CardDrawer({
  card,
  allCards,
  links,
  currentTab,
  onClose,
  onChange,
  onJumpToCard,
  onRequestDelete,
}: {
  card: LoreCard;
  allCards: LoreCard[];
  links: CardLink[];
  currentTab: BibleTab;
  onClose: () => void;
  onChange: (updated: LoreCard) => void;
  onJumpToCard: (target: LoreCard) => void;
  onRequestDelete: (id: string) => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [showAddFact, setShowAddFact] = useState(false);
  const [newFact, setNewFact] = useState({ label: "", value: "" });

  const connections = useMemo(() => {
    return links
      .map((l) => {
        const otherId =
          l.source === card.id
            ? l.target
            : l.target === card.id
              ? l.source
              : null;
        if (!otherId) return null;
        const other = allCards.find((c) => c.id === otherId);
        if (!other) return null;
        return { link: l, other };
      })
      .filter((x): x is { link: CardLink; other: LoreCard } => x !== null);
  }, [card.id, links, allCards]);

  function commitFact() {
    if (!newFact.label.trim()) return;
    onChange({ ...card, fields: [...card.fields, { ...newFact }] });
    setNewFact({ label: "", value: "" });
    setShowAddFact(false);
  }

  return (
    <aside className="fixed right-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-[400px] flex-col border-l border-border bg-card">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
          {CATEGORY_LABEL[card.category]} · Card
        </span>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* body */}
      <div className="bh-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {/* title — always visible */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
            Title
          </label>
          <input
            value={card.title}
            onChange={(e) => onChange({ ...card, title: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-accent"
          />
        </div>

        {/* status segmented control — always visible */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
            Canon status
          </label>
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            {(["canon", "draft", "deprecated"] as CanonStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => onChange({ ...card, status: s })}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                  card.status === s
                    ? s === "canon"
                      ? "bg-accent/15 text-accent"
                      : s === "draft"
                        ? "bg-[var(--draft)]/15 text-[var(--draft)]"
                        : "bg-[var(--surface-2)] text-[var(--text-3)]"
                    : "text-[var(--text-3)] hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--text-3)]">
            Canon = established fact, AI may reference · Draft = unconfirmed ·
            Deprecated = retired
          </p>
        </div>

        {/* summary — always visible */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
            Summary
          </label>
          <textarea
            value={card.summary}
            onChange={(e) => onChange({ ...card, summary: e.target.value })}
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
          />
        </div>

        {/* Body — expanded by default */}
        <CollapsibleSection title="Body" defaultOpen>
          <textarea
            value={card.body}
            onChange={(e) => onChange({ ...card, body: e.target.value })}
            rows={6}
            className="bh-scroll w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground outline-none focus:border-accent"
          />
        </CollapsibleSection>

        {/* Facts — collapsed by default */}
        <CollapsibleSection title="Facts" count={card.fields.length}>
          <div className="space-y-1.5">
            {card.fields.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[11px]"
              >
                <span className="shrink-0 text-[var(--text-3)]">{f.label}:</span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {f.value}
                </span>
                <button
                  onClick={() =>
                    onChange({
                      ...card,
                      fields: card.fields.filter((_, j) => j !== i),
                    })
                  }
                  className="shrink-0 text-[var(--text-3)] hover:text-destructive"
                  aria-label="Remove fact"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {showAddFact ? (
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  value={newFact.label}
                  onChange={(e) =>
                    setNewFact({ ...newFact, label: e.target.value })
                  }
                  placeholder="Label"
                  className="w-1/3 rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-accent"
                />
                <input
                  value={newFact.value}
                  onChange={(e) =>
                    setNewFact({ ...newFact, value: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitFact();
                    } else if (e.key === "Escape") {
                      setNewFact({ label: "", value: "" });
                      setShowAddFact(false);
                    }
                  }}
                  placeholder="Value"
                  autoFocus
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-accent"
                />
                <button
                  onClick={commitFact}
                  className="rounded p-1 text-[var(--text-3)] hover:text-foreground"
                  aria-label="Confirm add"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="pt-0.5">
                <button
                  onClick={() => setShowAddFact(true)}
                  className="text-[11px] text-[var(--text-3)] hover:text-foreground"
                >
                  + Add fact
                </button>
                <p className="mt-1 text-[10px] text-[var(--text-3)]">
                  Quick facts — any label and value
                </p>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Tags — collapsed by default */}
        <CollapsibleSection title="Tags" count={card.tags.length}>
          <div className="space-y-1.5">
            {card.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {card.tags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-[var(--text-2)]"
                  >
                    {t}
                    <button
                      onClick={() =>
                        onChange({
                          ...card,
                          tags: card.tags.filter((x) => x !== t),
                        })
                      }
                      className="text-[var(--text-3)] hover:text-destructive"
                      aria-label={`Remove ${t}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) {
                  e.preventDefault();
                  const v = newTag.trim();
                  if (!card.tags.includes(v)) {
                    onChange({ ...card, tags: [...card.tags, v] });
                  }
                  setNewTag("");
                }
              }}
              placeholder="Add tag, press Enter"
              className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-accent"
            />
          </div>
        </CollapsibleSection>

        {/* Connections — collapsed by default */}
        <CollapsibleSection title="Connections" count={connections.length}>
          {connections.length === 0 ? (
            <p className="text-[11px] text-[var(--text-3)]">
              No connections yet. Drag from a card edge to link.
            </p>
          ) : (
            <div className="space-y-1">
              {connections.map(({ link, other }) => {
                const targetTab = CATEGORY_TO_TAB[other.category];
                const catLabel = CATEGORY_LABEL[other.category];
                const crossTab = targetTab !== currentTab;
                return (
                  <div
                    key={link.id}
                    className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[12px] text-foreground">
                        {other.title}
                      </span>
                      <span className="text-[10px] text-[var(--text-3)]">
                        {link.label ?? "links to"}
                      </span>
                    </div>
                    {crossTab && targetTab && (
                      <button
                        onClick={() => onJumpToCard(other)}
                        className="flex shrink-0 items-center gap-1 rounded border border-border bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--text-3)] hover:border-accent/40 hover:text-accent"
                        title={`Open in ${catLabel}`}
                        aria-label={`Open in ${catLabel}`}
                      >
                        <ArrowUpRight className="h-2.5 w-2.5" />
                        {catLabel}
                      </button>
                    )}
                    <button
                      onClick={() => onJumpToCard(other)}
                      className="rounded p-1 text-[var(--text-3)] hover:text-foreground"
                      title="Open card"
                      aria-label="Open card"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>
      </div>

      {/* footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
            <Check className="h-3 w-3" />
            Auto-saved
          </span>
          <button
            onClick={() => onRequestDelete(card.id)}
            className="text-left text-[11px] text-[var(--destructive)] hover:underline"
          >
            Delete card…
          </button>
        </div>
        <button
          onClick={onClose}
          className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90"
        >
          Done
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ *
 * Empty-state — centered hint that doubles as a double-click target.
 * (React Flow still mounts behind this overlay so onDoubleClick works.)
 * ------------------------------------------------------------------ */
function EmptyStateOverlay({ onAction }: { onAction?: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">No cards yet</p>
        <p className="mt-1 text-xs text-[var(--text-3)]">
          Double-click anywhere to create one
        </p>
        {onAction && (
          <button
            onClick={onAction}
            className="pointer-events-auto mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            New card
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Coach layer — dismissable one-line hint bar above the minimap.
 * Persisted dismissal to localStorage "bh-coach-dismissed".
 * ------------------------------------------------------------------ */
function CoachBar({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card/90 px-4 py-2 text-xs text-[var(--text-2)] backdrop-blur">
      <span>
        Drag to move · scroll to zoom · double-click empty space for a new card
        · hover a card to find link points
      </span>
      <button
        onClick={onDismiss}
        className="rounded-full p-0.5 text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-foreground"
        aria-label="Dismiss hint"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Connection label popover — shows after a drag-to-connect.
 * Enter creates labeled edge. Escape / click-away creates unlabeled.
 * ------------------------------------------------------------------ */
function ConnectionLabelPopover({
  initialValue,
  onConfirm,
}: {
  initialValue: string;
  onConfirm: (label: string | undefined) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => onConfirm(undefined)}
    >
      <div
        className="w-80 rounded-lg border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
          Relationship (optional)
        </label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onConfirm(value.trim() || undefined);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onConfirm(undefined);
            }
          }}
          placeholder="e.g. caused, hunts, leads to"
          autoFocus
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-3)]">
            Esc or click away for unlabeled
          </span>
          <button
            onClick={() => onConfirm(value.trim() || undefined)}
            className="rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-[var(--surface-2)]"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Delete-confirm popover — centered viewport modal.
 * ------------------------------------------------------------------ */
function DeleteConfirmPopover({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="w-80 rounded-lg border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-foreground">
          Delete this card? Its connections will also be removed.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-[var(--text-2)] hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page — outer wrapper. Uses a `key` so the inner canvas fully remounts
 * on book/tab change. Hydrates from the mock store on each mount.
 * ------------------------------------------------------------------ */
export function WorldBiblePage({ bookId, tab, focusCardId }: PageProps) {
  const aiDock = useAiDock();
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘F / Ctrl+F opens search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Load all cards for the search overlay
  const { data: allSearchCards } = useCards(bookId);

  function handleSearchJump(card: LoreCard) {
    setSearchOpen(false);
    const targetTab = CATEGORY_TO_TAB[card.category];
    if (card.category === "character") {
      aiDock.setOpen(false);
      navigate({ name: "cast", bookId, focusCardId: card.id });
    } else if (targetTab) {
      navigate({ name: "world", bookId, tab: targetTab, focusCardId: card.id });
    }
  }

  const { navigate } = useRouter();

  // No tab → World Overview page
  if (!tab) {
    return (
      <>
        <WorldOverview bookId={bookId} />
        <AiDock open={aiDock.open} scope={aiDock.scope} scopeData={aiDock.scopeData} onClose={() => aiDock.setOpen(false)} />
      </>
    );
  }
  // Glossary tab → table view (built separately, imported)
  if (tab === "glossary") {
    return (
      <>
        <GlossaryPage bookId={bookId} aiDock={aiDock} />
        <AiDock open={aiDock.open} scope={aiDock.scope} scopeData={aiDock.scopeData} onClose={() => aiDock.setOpen(false)} />
      </>
    );
  }
  // Cosmology → canvas + universal-laws rail
  if (tab === "cosmology") {
    return (
      <>
        <CosmologyView key={`${bookId}-${tab}`} bookId={bookId} tab={tab} focusCardId={focusCardId} aiDock={aiDock} />
        <AiDock open={aiDock.open} scope={aiDock.scope} scopeData={aiDock.scopeData} onClose={() => aiDock.setOpen(false)} />
      </>
    );
  }
  // History → timeline-first + causal map toggle
  if (tab === "history") {
    return (
      <>
        <HistoryView key={`${bookId}-${tab}`} bookId={bookId} tab={tab} focusCardId={focusCardId} aiDock={aiDock} />
        <AiDock open={aiDock.open} scope={aiDock.scope} scopeData={aiDock.scopeData} onClose={() => aiDock.setOpen(false)} />
      </>
    );
  }
  // Bestiary → card grid (not canvas)
  if (tab === "bestiary") {
    return (
      <>
        <BestiaryView key={`${bookId}-${tab}`} bookId={bookId} tab={tab} focusCardId={focusCardId} aiDock={aiDock} />
        <AiDock open={aiDock.open} scope={aiDock.scope} scopeData={aiDock.scopeData} onClose={() => aiDock.setOpen(false)} />
      </>
    );
  }
  // Magic / Geography / Factions → standard canvas
  return (
    <>
      <WorldBibleCanvas
        key={`${bookId}-${tab}`}
        bookId={bookId}
        tab={tab}
        focusCardId={focusCardId}
        aiDock={aiDock}
      />
      <AiDock open={aiDock.open} scope={aiDock.scope} onClose={() => aiDock.setOpen(false)} />
      {searchOpen && (
        <BibleSearchOverlay
          cards={allSearchCards ?? []}
          onClose={() => setSearchOpen(false)}
          onJump={handleSearchJump}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * useBibleTabState — shared state + handlers for any Bible tab view.
 * Owns: data loading (via React Query hooks), cards/links local state
 * (for optimistic updates), selection, mutations, delete-key, drawer data.
 * Canvas-specific RF state stays in the canvas.
 * ------------------------------------------------------------------ */
function useBibleTabState(bookId: string, tab: CanvasTab, focusCardId?: string) {
  const { navigate } = useRouter();

  /* ----- load from API via React Query hooks ----- */
  const { data: cardsData } = useCards(bookId);
  const { data: linksData } = useLinks(bookId);
  const updateCardMut = useUpdateCard();
  const createCardMut = useCreateCard();
  const deleteCardMut = useDeleteCard();
  const createLinkMut = useCreateLink();
  const deleteLinkMut = useDeleteLink();

  /* ----- local state (optimistic overrides on top of API data) ----- */
  const apiCards = useMemo<LoreCard[]>(
    () => (cardsData ?? []).filter((c) => c.bookId === bookId && c.category === tab),
    [cardsData, bookId, tab],
  );
  const [overrides, setOverrides] = useState<Record<string, LoreCard>>({});
  const [tempCards, setTempCards] = useState<LoreCard[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const cards = useMemo<LoreCard[]>(() => {
    return [
      ...apiCards.filter((c) => !deletedIds.has(c.id)).map((c) => overrides[c.id] ?? c),
      ...tempCards,
    ];
  }, [apiCards, overrides, tempCards, deletedIds]);

  // Clean up tempCards/overrides/deletes once API refetches
  const apiIdSet = useMemo(() => new Set(apiCards.map((c) => c.id)), [apiCards]);
  const [lastApiIdSet, setLastApiIdSet] = useState<Set<string>>(new Set());
  if (apiIdSet !== lastApiIdSet) {
    setLastApiIdSet(apiIdSet);
    // Remove tempCards that are now in API
    const remainingTemps = tempCards.filter((c) => !apiIdSet.has(c.id));
    if (remainingTemps.length !== tempCards.length) setTempCards(remainingTemps);
    // Clear overrides for cards that now match API — keep override if ANY field
    // differs (including x/y position, canon_status, tags, fields)
    const newOverrides: Record<string, LoreCard> = {};
    for (const [id, card] of Object.entries(overrides)) {
      if (apiIdSet.has(id)) {
        const apiCard = apiCards.find((c) => c.id === id);
        if (apiCard && (
          card.title !== apiCard.title ||
          card.summary !== apiCard.summary ||
          card.body !== apiCard.body ||
          card.x !== apiCard.x ||
          card.y !== apiCard.y ||
          card.status !== apiCard.status ||
          JSON.stringify(card.tags) !== JSON.stringify(apiCard.tags) ||
          JSON.stringify(card.fields) !== JSON.stringify(apiCard.fields)
        )) {
          newOverrides[id] = card;
        }
      } else {
        // Card not in API yet — keep the override
        newOverrides[id] = card;
      }
    }
    if (Object.keys(newOverrides).length !== Object.keys(overrides).length) {
      setOverrides(newOverrides);
    }
    // Clear deletedIds that are no longer in API
    const remainingDeletes = new Set([...deletedIds].filter((id) => apiIdSet.has(id)));
    if (remainingDeletes.size !== deletedIds.size) setDeletedIds(remainingDeletes);
  }

  // allCards: all cards for this book (any category) for cross-tab lookups
  const allCards = useMemo<LoreCard[]>(
    () => (cardsData ?? []).filter((c) => c.bookId === bookId),
    [cardsData, bookId],
  );

  const [links, setLinks] = useState<CardLink[]>([]);
  const [lastLinksKey, setLastLinksKey] = useState(linksData);
  if (linksData !== lastLinksKey) {
    setLastLinksKey(linksData);
    setLinks(linksData ?? []);
  }

  // Helper: update card data locally + via API
  const updateCardLocal = useCallback((updated: LoreCard) => {
    setOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    updateCardMut.mutate({ id: updated.id, updates: updated });
  }, [updateCardMut]);

  const [selectedId, setSelectedId] = useState<string | null>(focusCardId ?? null);
  const [pendingConnection, setPendingConnection] = useState<{
    source: string;
    target: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const [coachDismissed, setCoachDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("bh-coach-dismissed") === "1";
  });

  /* ----- handlers ----- */
  const onSelectCard = useCallback((id: string) => setSelectedId(id), []);

  const handleRequestDelete = useCallback((id: string) => {
    setPendingDelete(id);
  }, []);

  const deleteCard = useCallback((id: string) => {
    setDeletedIds((prev) => new Set([...prev, id]));
    setTempCards((prev) => prev.filter((c) => c.id !== id));
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLinks((prev) => prev.filter((l) => l.source !== id && l.target !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
    deleteCardMut.mutate(id);
  }, [deleteCardMut]);

  const confirmConnection = useCallback(
    (label: string | undefined) => {
      if (pendingConnection) {
        // Optimistic: add locally
        const tempId = `link-new-${Date.now()}`;
        setLinks((prev) => [...prev, {
          id: tempId,
          source: pendingConnection.source,
          target: pendingConnection.target,
          ...(label ? { label } : {}),
        }]);
        // Persist via API
        createLinkMut.mutate({
          bookId,
          input: {
            fromCardId: pendingConnection.source,
            toCardId: pendingConnection.target,
            label: label,
          },
        });
      }
      setPendingConnection(null);
    },
    [pendingConnection, createLinkMut, bookId],
  );

  const handleConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return;
    if (params.source === params.target) return;
    setPendingConnection({ source: params.source, target: params.target });
  }, []);

  const handleCardChange = useCallback((updated: LoreCard) => {
    updateCardLocal(updated);
  }, [updateCardLocal]);

  const handleJumpToCard = useCallback(
    (target: LoreCard) => {
      const targetTab = CATEGORY_TO_TAB[target.category];
      if (targetTab && targetTab !== tab) {
        navigate({
          name: "world",
          bookId,
          tab: targetTab,
          focusCardId: target.id,
        });
      } else if (target.category === "character") {
        navigate({ name: "cast", bookId, focusCardId: target.id });
      }
    },
    [navigate, bookId, tab],
  );

  const dismissCoach = useCallback(() => {
    setCoachDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("bh-coach-dismissed", "1");
    }
  }, []);

  const createCard = useCallback(
    (x: number, y: number) => {
      const tempId = `card-new-${Date.now()}`;
      const newCard: LoreCard = {
        id: tempId,
        bookId,
        category: tab,
        title: "Untitled",
        summary: "",
        body: "",
        status: "draft",
        x: Math.round(x),
        y: Math.round(y),
        fields: [],
        tags: [],
      };
      setTempCards((prev) => [...prev, newCard]);
      setSelectedId(tempId);
      createCardMut.mutate({
        bookId,
        input: {
          category: tab,
          title: "Untitled",
          x: Math.round(x),
          y: Math.round(y),
        },
      });
      return tempId;
    },
    [bookId, tab, createCardMut],
  );

  /* ----- Delete-key handler — fires when a card is selected and no input focused ----- */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          (active as HTMLElement).isContentEditable
        ) {
          return;
        }
      }
      if (selectedId) {
        e.preventDefault();
        setPendingDelete(selectedId);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

  /* ----- derived ----- */
  const selectedCard = selectedId
    ? cards.find((c) => c.id === selectedId) ?? null
    : null;

  const selectedLinks = useMemo<CardLink[]>(
    () =>
      selectedCard
        ? links.filter(
            (l) => l.source === selectedCard.id || l.target === selectedCard.id,
          )
        : [],
    [selectedCard, links],
  );

  return {
    cards,
    setCards: (updater: LoreCard[] | ((prev: LoreCard[]) => LoreCard[])) => {
      const prev = cards;
      const next = typeof updater === "function" ? (updater as (p: LoreCard[]) => LoreCard[])(prev) : updater;
      const prevMap = new Map(prev.map((c) => [c.id, c]));
      for (const card of next) {
        const prevCard = prevMap.get(card.id);
        if (!prevCard) {
          setTempCards((p) => [...p, card]);
        } else if (card !== prevCard) {
          updateCardLocal(card);
        }
      }
      const nextIds = new Set(next.map((c) => c.id));
      for (const prevCard of prev) {
        if (!nextIds.has(prevCard.id)) {
          setDeletedIds((p) => new Set([...p, prevCard.id]));
        }
      }
    },
    updateCardLocal,
    links,
    setLinks,
    allCards,
    selectedId,
    setSelectedId,
    selectedCard,
    selectedLinks,
    pendingConnection,
    setPendingConnection,
    pendingDelete,
    setPendingDelete,
    coachDismissed,
    dismissCoach,
    onSelectCard,
    handleRequestDelete,
    deleteCard,
    confirmConnection,
    handleConnect,
    handleCardChange,
    handleJumpToCard,
    createCard,
    navigate,
  };
}


function WorldBibleCanvas({ bookId, tab, focusCardId, aiDock }: CanvasPageProps) {
  const rfRef = useRef<ReactFlowInstance<LoreNodeType, EdgeType> | null>(null);

  const st = useBibleTabState(bookId, tab, focusCardId);
  const {
    cards,
    setCards,
    links,
    allCards,
    selectedId,
    setSelectedId,
    selectedCard,
    selectedLinks,
    pendingConnection,
    pendingDelete,
    setPendingDelete,
    coachDismissed,
    dismissCoach,
    onSelectCard,
    handleRequestDelete,
    deleteCard,
    confirmConnection,
    handleConnect,
    handleCardChange,
    createCard,
    navigate,
  } = st;

  const [isTidying, setIsTidying] = useState(false);
  const [viewMode, setViewMode] = useState<"flow" | "canvas">("flow");

  /* ----- FLOW layout: compute top-down positions without writing to DB ----- */
  const flowPositions = useMemo(() => {
    if (viewMode !== "flow") return null;
    const incoming = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    for (const c of cards) { incoming.set(c.id, 0); adjacency.set(c.id, []); }
    for (const l of links) {
      if (incoming.has(l.target)) incoming.set(l.target, (incoming.get(l.target) ?? 0) + 1);
      if (adjacency.has(l.source)) adjacency.get(l.source)!.push(l.target);
    }
    const roots = cards.filter((c) => (incoming.get(c.id) ?? 0) === 0);
    const positions = new Map<string, { x: number; y: number }>();
    const colWidth = 280, rowHeight = 200, startX = 40, startY = 40;
    const visited = new Set<string>();
    const queue: { id: string; row: number }[] = roots.map((r) => ({ id: r.id, row: 0 }));
    if (queue.length === 0 && cards.length > 0) queue.push({ id: cards[0].id, row: 0 });
    while (queue.length > 0) {
      const batch: { id: string; row: number }[] = [];
      const remaining: { id: string; row: number }[] = [];
      const currentRow = queue[0].row;
      for (const item of queue) { if (item.row === currentRow) batch.push(item); else remaining.push(item); }
      let batchCol = 0;
      for (const item of batch) {
        if (visited.has(item.id)) continue;
        visited.add(item.id);
        positions.set(item.id, { x: startX + batchCol * colWidth, y: startY + item.row * rowHeight });
        batchCol++;
        const children = adjacency.get(item.id) ?? [];
        for (const childId of children) { if (!visited.has(childId)) remaining.push({ id: childId, row: item.row + 1 }); }
      }
      queue.length = 0; queue.push(...remaining);
    }
    let orphanCol = 0;
    const orphanRow = positions.size > 0 ? Math.max(...[...positions.values()].map((p) => p.y)) / rowHeight + 2 : 0;
    for (const c of cards) {
      if (!positions.has(c.id)) { positions.set(c.id, { x: startX + orphanCol * colWidth, y: startY + orphanRow * rowHeight }); orphanCol++; }
    }
    return positions;
  }, [viewMode, cards, links]);

  /* ----- canvas-specific handlers ----- */
  const handleNodeDragStop = useCallback(
    (_evt: MouseEvent | TouchEvent, node: LoreNodeType) => {
      if (!node) return;
      setCards((prev) =>
        prev.map((c) =>
          c.id === node.id
            ? { ...c, x: Math.round(node.position.x), y: Math.round(node.position.y) }
            : c,
        ),
      );
    },
    [setCards],
  );

  const handleTidy = useCallback(() => {
    setIsTidying(true);
    setCards((prev) =>
      prev.map((c, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        return { ...c, x: 40 + col * 300, y: 40 + row * 220 };
      }),
    );
    window.setTimeout(() => setIsTidying(false), 320);
  }, [setCards]);

  const handleNewCard = useCallback(() => {
    const inst = rfRef.current;
    const center = inst
      ? inst.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: (window.innerHeight - 56) / 2 + 56,
        })
      : { x: 240, y: 200 };
    createCard(center.x - 120, center.y - 40);
  }, [createCard]);

  const handlePaneDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".react-flow__node")) return;
      const inst = rfRef.current;
      if (!inst) return;
      const pos = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      createCard(pos.x - 120, pos.y - 40);
    },
    [createCard],
  );

  const handleTab = useCallback(
    (t: BibleTab) => navigate({ name: "world", bookId, tab: t }),
    [navigate, bookId],
  );

  const handleJumpToCard = useCallback(
    (target: LoreCard) => {
      const targetTab = CATEGORY_TO_TAB[target.category];
      if (targetTab && targetTab !== tab) {
        navigate({ name: "world", bookId, tab: targetTab, focusCardId: target.id });
      } else if (target.category === "character") {
        navigate({ name: "cast", bookId, focusCardId: target.id });
      } else {
        setSelectedId(target.id);
        setTimeout(() => {
          rfRef.current?.setCenter(target.x + 120, target.y + 60, {
            zoom: 1.2,
            duration: 400,
          });
        }, 50);
      }
    },
    [navigate, bookId, tab, setSelectedId],
  );

  /* ----- nodes state + sync effect ----- */
  const initialNodes = useMemo<LoreNodeType[]>(() => [], []);
  const [nodes, setNodes, onNodesChange] = useNodesState<LoreNodeType>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EdgeType>([]);

  useEffect(() => {
    setNodes((prev) => {
      const ids = new Set(cards.map((c) => c.id));
      const existing = new Set(prev.map((n) => n.id));
      const kept = prev
        .filter((n) => ids.has(n.id))
        .map((n) => {
          const c = cards.find((x) => x.id === n.id);
          if (!c) return n;
          return {
            ...n,
            position: flowPositions?.get(c.id) ?? { x: c.x, y: c.y },
            data: { card: c, onSelect: onSelectCard, onRequestDelete: handleRequestDelete },
            selected: n.id === selectedId,
          };
        });
      const added = cards
        .filter((c) => !existing.has(c.id))
        .map<LoreNodeType>((c) => ({
          id: c.id,
          type: "lore",
          position: flowPositions?.get(c.id) ?? { x: c.x, y: c.y },
          data: { card: c, onSelect: onSelectCard, onRequestDelete: handleRequestDelete },
          selected: c.id === selectedId,
        }));
      return [...kept, ...added];
    });
  }, [cards, selectedId, onSelectCard, handleRequestDelete, setNodes, flowPositions]);

  useEffect(() => {
    const ids = new Set(cards.map((c) => c.id));
    setEdges(() =>
      links
        .filter((l) => ids.has(l.source) && ids.has(l.target))
        .map<EdgeType>((l) => ({
          id: l.id,
          source: l.source,
          target: l.target,
          label: l.label,
          type: "default",
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#3f3f47" },
          animated: false,
        })),
    );
  }, [cards, links, setEdges]);

  const handleInit = useCallback(
    (inst: ReactFlowInstance<LoreNodeType, EdgeType>) => {
      rfRef.current = inst;
      if (!focusCardId) return;
      const card = cards.find((c) => c.id === focusCardId);
      if (!card) return;
      setTimeout(() => {
        inst.setCenter(card.x + 120, card.y + 60, { zoom: 1.2, duration: 400 });
      }, 60);
    },
    [focusCardId, cards],
  );

  // Auto-fit view when nodes first appear (async data load)
  const hasFitRef = useRef(false);
  useEffect(() => {
    if (nodes.length > 0 && !hasFitRef.current) {
      hasFitRef.current = true;
      setTimeout(() => rfRef.current?.fitView({ padding: 0.25, maxZoom: 1.1 }), 100);
    }
  }, [nodes.length]);

  const isEmpty = cards.length === 0;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <style>{CANVAS_CSS}</style>
      {/* tab bar + view toggle */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-3">
        <div className="bh-scroll flex flex-1 items-center overflow-x-auto">
          {BIBLE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTab(t.id)}
              className={cn(
                "relative whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
                tab === t.id ? "text-accent" : "text-[var(--text-2)] hover:text-foreground",
              )}
            >
              {t.label}
              {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
            </button>
          ))}
        </div>
        {/* FLOW/CANVAS toggle */}
        <div className="ml-2 flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
          <button
            onClick={() => setViewMode("flow")}
            className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
              viewMode === "flow" ? "bg-accent/15 text-accent" : "text-[var(--text-3)] hover:text-foreground")}
          >
            Flow
          </button>
          <button
            onClick={() => setViewMode("canvas")}
            className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
              viewMode === "canvas" ? "bg-accent/15 text-accent" : "text-[var(--text-3)] hover:text-foreground")}
          >
            Canvas
          </button>
        </div>
        {viewMode === "canvas" && (
          <button
            onClick={handleTidy}
            className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
            aria-label="Tidy up layout"
            title="Tidy up layout"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={handleNewCard}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="New card"
          title="New card"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => aiDock.openWith(`${CATEGORY_LABEL[tab] ?? tab} · ${cards.length} card${cards.length !== 1 ? "s" : ""}`, { bookId, tab })}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="AI"
          title="AI"
        >
          <Bot className="h-4 w-4" />
        </button>
      </div>

      <div
        className="relative flex-1 overflow-hidden"
        onDoubleClick={viewMode === "canvas" ? handlePaneDoubleClick : undefined}
      >
        <ReactFlow<LoreNodeType, EdgeType>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeDragStop={viewMode === "canvas" ? handleNodeDragStop : undefined}
          nodeTypes={nodeTypes}
          onNodeClick={(_e, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          onInit={handleInit}
          connectionMode={ConnectionMode.Loose}
          snapToGrid
          snapGrid={[22, 22]}
          className={cn(isTidying && "bh-tidying")}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
          minZoom={0.2}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="rgba(255,255,255,0.22)"
            gap={24}
            size={1.6}
          />
          <Controls position="bottom-left" />
          <MiniMap position="bottom-right" pannable zoomable />
        </ReactFlow>

        {isEmpty && <EmptyStateOverlay onAction={handleNewCard} />}

        {!coachDismissed && <CoachBar onDismiss={dismissCoach} />}
      </div>

      {selectedCard && (
        <CardDrawer
          card={selectedCard}
          allCards={allCards}
          links={selectedLinks}
          currentTab={tab}
          onClose={() => setSelectedId(null)}
          onChange={handleCardChange}
          onJumpToCard={handleJumpToCard}
          onRequestDelete={handleRequestDelete}
        />
      )}

      {pendingConnection && (
        <ConnectionLabelPopover
          initialValue=""
          onConfirm={confirmConnection}
        />
      )}

      {pendingDelete && (
        <DeleteConfirmPopover
          onConfirm={() => {
            deleteCard(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/* ================================================================== *
 * COSMOLOGY VIEW — canvas + universal-laws rail.
 * Cards tagged "universal-law" are pulled OUT of the canvas and shown
 * in a pinned rail beside it. Everything else stays on the canvas.
 * ================================================================== */

function UniversalLawsRail({
  laws,
  onSelect,
  selectedId,
  onAdd,
}: {
  laws: LoreCard[];
  onSelect: (id: string) => void;
  selectedId: string | null;
  onAdd: () => void;
}) {
  return (
    <div className="flex w-[220px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
          Universal Laws
        </span>
        <button
          onClick={onAdd}
          className="rounded p-0.5 text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="Add universal law"
          title="Add universal law"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="bh-scroll flex-1 space-y-1 overflow-y-auto p-2">
        {laws.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-[var(--text-3)]">
            No universal laws yet. Tag a card with{" "}
            <span className="font-mono">universal-law</span> to pin it here.
          </p>
        ) : (
          laws.map((law) => (
            <button
              key={law.id}
              onClick={() => onSelect(law.id)}
              className={cn(
                "block w-full rounded-md border p-2.5 text-left transition-colors",
                selectedId === law.id
                  ? "border-accent/40 bg-accent/5"
                  : "border-border hover:bg-[var(--surface-2)]",
              )}
            >
              <div className="text-[12px] font-semibold text-foreground">
                {law.title}
              </div>
              {law.summary && (
                <div className="mt-0.5 line-clamp-2 text-[11px] text-[var(--text-2)]">
                  {law.summary}
                </div>
              )}
              {law.status === "draft" && (
                <span className="mt-1 inline-block text-[9px] uppercase tracking-wide text-[var(--draft)]">
                  DRAFT
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function CosmologyView({ bookId, tab, focusCardId, aiDock }: CanvasPageProps) {
  const rfRef = useRef<ReactFlowInstance<LoreNodeType, EdgeType> | null>(null);

  const st = useBibleTabState(bookId, tab, focusCardId);
  const {
    cards,
    setCards,
    links,
    allCards,
    selectedId,
    setSelectedId,
    selectedCard,
    selectedLinks,
    pendingConnection,
    pendingDelete,
    setPendingDelete,
    coachDismissed,
    dismissCoach,
    onSelectCard,
    handleRequestDelete,
    deleteCard,
    confirmConnection,
    handleConnect,
    handleCardChange,
    createCard,
    navigate,
  } = st;

  const [isTidying, setIsTidying] = useState(false);
  const [cosView, setCosView] = useState<"reading" | "canvas">("reading");

  // Split cards: universal-law tagged → rail; rest → canvas
  const { canvasCards, lawCards } = useMemo(() => {
    const canvas: LoreCard[] = [];
    const laws: LoreCard[] = [];
    for (const c of cards) {
      if (c.tags.includes("universal-law")) laws.push(c);
      else canvas.push(c);
    }
    return { canvasCards: canvas, lawCards: laws };
  }, [cards]);

  // For the canvas, we need to show only canvasCards, but the hook manages ALL
  // cards. So the nodes/edges derivation uses canvasCards instead of cards.
  // But setCards still operates on the full set (the hook handles it).

  const handleNodeDragStop = useCallback(
    (_evt: MouseEvent | TouchEvent, node: LoreNodeType) => {
      if (!node) return;
      setCards((prev) =>
        prev.map((c) =>
          c.id === node.id
            ? { ...c, x: Math.round(node.position.x), y: Math.round(node.position.y) }
            : c,
        ),
      );
    },
    [setCards],
  );

  const handleTidy = useCallback(() => {
    setIsTidying(true);
    setCards((prev) =>
      prev.map((c, i) => {
        if (c.tags.includes("universal-law")) return c; // don't move laws
        const nonLawIdx = prev.filter((x) => !x.tags.includes("universal-law")).indexOf(c);
        const col = nonLawIdx % 3;
        const row = Math.floor(nonLawIdx / 3);
        return { ...c, x: 40 + col * 300, y: 40 + row * 220 };
      }),
    );
    window.setTimeout(() => setIsTidying(false), 320);
  }, [setCards]);

  const handleNewCard = useCallback(() => {
    const inst = rfRef.current;
    const center = inst
      ? inst.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: (window.innerHeight - 56) / 2 + 56,
        })
      : { x: 240, y: 200 };
    createCard(center.x - 120, center.y - 40);
  }, [createCard]);

  const handleAddLaw = useCallback(() => {
    const id = createCard(500, 60);
    // tag it as universal-law
    setCards((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, tags: [...c.tags, "universal-law"], title: "New Universal Law" } : c,
      ),
    );
  }, [createCard, setCards]);

  const handlePaneDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".react-flow__node")) return;
      const inst = rfRef.current;
      if (!inst) return;
      const pos = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      createCard(pos.x - 120, pos.y - 40);
    },
    [createCard],
  );

  const handleTab = useCallback(
    (t: BibleTab) => navigate({ name: "world", bookId, tab: t }),
    [navigate, bookId],
  );

  const handleJumpToCard = useCallback(
    (target: LoreCard) => {
      const targetTab = CATEGORY_TO_TAB[target.category];
      if (targetTab && targetTab !== tab) {
        navigate({ name: "world", bookId, tab: targetTab, focusCardId: target.id });
      } else if (target.category === "character") {
        navigate({ name: "cast", bookId, focusCardId: target.id });
      } else {
        setSelectedId(target.id);
        setTimeout(() => {
          rfRef.current?.setCenter(target.x + 120, target.y + 60, {
            zoom: 1.2,
            duration: 400,
          });
        }, 50);
      }
    },
    [navigate, bookId, tab, setSelectedId],
  );

  // nodes/edges derived from canvasCards (not all cards)
  const initialNodes = useMemo<LoreNodeType[]>(() => [], []);
  const [nodes, setNodes, onNodesChange] = useNodesState<LoreNodeType>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EdgeType>([]);

  useEffect(() => {
    setNodes((prev) => {
      const ids = new Set(canvasCards.map((c) => c.id));
      const existing = new Set(prev.map((n) => n.id));
      const kept = prev
        .filter((n) => ids.has(n.id))
        .map((n) => {
          const c = canvasCards.find((x) => x.id === n.id);
          if (!c) return n;
          return {
            ...n,
            position: flowPositions?.get(c.id) ?? { x: c.x, y: c.y },
            data: { card: c, onSelect: onSelectCard, onRequestDelete: handleRequestDelete },
            selected: n.id === selectedId,
          };
        });
      const added = canvasCards
        .filter((c) => !existing.has(c.id))
        .map<LoreNodeType>((c) => ({
          id: c.id,
          type: "lore",
          position: flowPositions?.get(c.id) ?? { x: c.x, y: c.y },
          data: { card: c, onSelect: onSelectCard, onRequestDelete: handleRequestDelete },
          selected: c.id === selectedId,
        }));
      return [...kept, ...added];
    });
  }, [canvasCards, selectedId, onSelectCard, handleRequestDelete, setNodes]);

  useEffect(() => {
    const ids = new Set(canvasCards.map((c) => c.id));
    setEdges(() =>
      links
        .filter((l) => ids.has(l.source) && ids.has(l.target))
        .map<EdgeType>((l) => ({
          id: l.id,
          source: l.source,
          target: l.target,
          label: l.label,
          type: "default",
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#3f3f47" },
          animated: false,
        })),
    );
  }, [canvasCards, links, setEdges]);

  const handleInit = useCallback(
    (inst: ReactFlowInstance<LoreNodeType, EdgeType>) => {
      rfRef.current = inst;
      if (!focusCardId) return;
      const card = canvasCards.find((c) => c.id === focusCardId);
      if (!card) return;
      setTimeout(() => {
        inst.setCenter(card.x + 120, card.y + 60, { zoom: 1.2, duration: 400 });
      }, 60);
    },
    [focusCardId, canvasCards],
  );

  // Auto-fit view when nodes first appear (async data load)
  const cosHasFitRef = useRef(false);
  useEffect(() => {
    if (nodes.length > 0 && !cosHasFitRef.current) {
      cosHasFitRef.current = true;
      setTimeout(() => rfRef.current?.fitView({ padding: 0.25, maxZoom: 1.1 }), 100);
    }
  }, [nodes.length]);

  const isEmpty = canvasCards.length === 0;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <style>{CANVAS_CSS}</style>
      {/* tab bar + view toggle */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-3">
        <div className="bh-scroll flex flex-1 items-center overflow-x-auto">
          {BIBLE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTab(t.id)}
              className={cn(
                "relative whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
                tab === t.id ? "text-accent" : "text-[var(--text-2)] hover:text-foreground",
              )}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
          <button
            onClick={() => setCosView("reading")}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
              cosView === "reading"
                ? "bg-accent/15 text-accent"
                : "text-[var(--text-3)] hover:text-foreground",
            )}
          >
            Reading
          </button>
          <button
            onClick={() => setCosView("canvas")}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
              cosView === "canvas"
                ? "bg-accent/15 text-accent"
                : "text-[var(--text-3)] hover:text-foreground",
            )}
          >
            Canvas
          </button>
        </div>
        <button
          onClick={handleNewCard}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="New card"
          title="New card"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => aiDock?.openWith(`Cosmology · ${cards.length} card${cards.length !== 1 ? "s" : ""}`, { bookId, tab })}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="AI"
          title="AI"
        >
          <Bot className="h-4 w-4" />
        </button>
      </div>

      {cosView === "reading" ? (
        /* ----- READING VIEW ----- */
        <div className="flex flex-1 overflow-hidden">
          <div className="bh-scroll flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[40rem] px-6 py-10">
              {cards.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                  <p className="text-sm font-medium text-foreground">No cosmology cards yet</p>
                  <p className="text-xs text-[var(--text-3)]">
                    Describe the structure of your world — planes, laws, origins.
                  </p>
                  <button
                    onClick={handleNewCard}
                    className="mt-2 flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    New card
                  </button>
                </div>
              ) : (
                <div className="space-y-10">
                  {cards.map((card) => (
                    <section key={card.id} id={`card-${card.id}`} className="scroll-mt-6">
                      <input
                        value={card.title}
                        onChange={(e) => handleCardChange({ ...card, title: e.target.value })}
                        className="mb-2 w-full bg-transparent font-serif text-2xl font-semibold text-foreground focus:outline-none"
                      />
                      <input
                        value={card.summary}
                        onChange={(e) => handleCardChange({ ...card, summary: e.target.value })}
                        placeholder="One-line summary…"
                        className="mb-4 w-full bg-transparent text-sm text-[var(--text-2)] focus:outline-none"
                      />
                      <textarea
                        value={card.body}
                        onChange={(e) => handleCardChange({ ...card, body: e.target.value })}
                        placeholder="Describe this aspect of your world…"
                        rows={4}
                        className="w-full resize-none rounded-md border border-transparent bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground transition-colors focus:border-border focus:bg-[var(--surface-2)] focus:outline-none"
                      />
                      {card.status === "draft" && (
                        <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-[var(--draft)]">
                          DRAFT
                        </span>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* universal laws rail */}
          <UniversalLawsRail
            laws={lawCards}
            onSelect={(id) => {
              const el = document.getElementById(`card-${id}`);
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            selectedId={selectedId}
            onAdd={handleAddLaw}
          />
        </div>
      ) : (
        /* ----- CANVAS VIEW ----- */
        <div className="flex flex-1 overflow-hidden">
          <div className="relative flex-1 overflow-hidden" onDoubleClick={viewMode === "canvas" ? handlePaneDoubleClick : undefined}>
            <ReactFlow<LoreNodeType, EdgeType>
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onNodeDragStop={viewMode === "canvas" ? handleNodeDragStop : undefined}
              nodeTypes={nodeTypes}
              onNodeClick={(_e, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
              onInit={handleInit}
              connectionMode={ConnectionMode.Loose}
              snapToGrid
              snapGrid={[22, 22]}
              className={cn(isTidying && "bh-tidying")}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
              minZoom={0.2}
              maxZoom={2.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                color="rgba(255,255,255,0.22)"
                gap={24}
                size={1.6}
              />
              <Controls position="bottom-left" />
            </ReactFlow>
            {isEmpty && <EmptyStateOverlay onAction={handleNewCard} />}
            {!coachDismissed && <CoachBar onDismiss={dismissCoach} />}
          </div>
          <UniversalLawsRail
            laws={lawCards}
            onSelect={onSelectCard}
            selectedId={selectedId}
            onAdd={handleAddLaw}
          />
        </div>
      )}

      {selectedCard && (
        <CardDrawer
          card={selectedCard}
          allCards={allCards}
          links={selectedLinks}
          currentTab={tab}
          onClose={() => setSelectedId(null)}
          onChange={handleCardChange}
          onJumpToCard={handleJumpToCard}
          onRequestDelete={handleRequestDelete}
        />
      )}

      {pendingConnection && (
        <ConnectionLabelPopover initialValue="" onConfirm={confirmConnection} />
      )}

      {pendingDelete && (
        <DeleteConfirmPopover
          onConfirm={() => {
            deleteCard(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/* ================================================================== *
 * HISTORY VIEW — timeline-first primary view + optional causal map.
 * Default: horizontal era track with event cards in chronological order.
 * Toggle: causal map (the React Flow canvas, same data).
 * ================================================================== */

function HistoryTimeline({
  cards,
  links,
  selectedId,
  onSelect,
  onReorder,
}: {
  cards: LoreCard[];
  links: CardLink[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (fromId: string, toIndex: number) => void;
}) {
  // Sort cards by x position (left = earlier) — the canvas x is the timeline.
  const sorted = useMemo(
    () => [...cards].sort((a, b) => a.x - b.x),
    [cards],
  );

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  return (
    <div className="bh-scroll flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex min-h-full items-center px-8">
        {/* the timeline track */}
        <div className="relative flex items-center gap-0">
          {/* horizontal line */}
          <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />

          {sorted.map((card, i) => {
            const connectedLinks = links.filter(
              (l) => l.source === card.id || l.target === card.id,
            );
            return (
              <div key={card.id} className="relative z-10 flex items-center">
                <button
                  draggable
                  onDragStart={() => setDragId(card.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverIdx(i);
                  }}
                  onDragEnd={() => {
                    if (dragId && dragOverIdx !== null && dragOverIdx !== i) {
                      // swap positions
                      const target = sorted[dragOverIdx];
                      if (target) {
                        onReorder(dragId, target.x);
                      }
                    }
                    setDragId(null);
                    setDragOverIdx(null);
                  }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onClick={() => onSelect(card.id)}
                  className={cn(
                    "group relative flex w-[180px] flex-col items-center gap-2 rounded-lg border p-3 transition-colors",
                    selectedId === card.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-accent/40",
                    dragOverIdx === i && "ring-2 ring-accent/30",
                  )}
                >
                  {/* the dot on the line */}
                  <span
                    className={cn(
                      "absolute top-1/2 left-[-6px] h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 transition-colors",
                      selectedId === card.id
                        ? "border-accent bg-accent"
                        : "border-border bg-card",
                    )}
                  />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                    Event {i + 1}
                  </span>
                  <span className="text-center text-[13px] font-semibold text-foreground">
                    {card.title}
                  </span>
                  {card.summary && (
                    <span className="line-clamp-2 text-center text-[11px] text-[var(--text-2)]">
                      {card.summary}
                    </span>
                  )}
                  {connectedLinks.length > 0 && (
                    <span className="text-[10px] text-[var(--text-3)]">
                      {connectedLinks.length} link{connectedLinks.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {card.status === "draft" && (
                    <span className="text-[9px] uppercase tracking-wide text-[var(--draft)]">
                      DRAFT
                    </span>
                  )}
                </button>
                {i < sorted.length - 1 && <div className="w-8" />}
              </div>
            );
          })}

          {/* empty state */}
          {sorted.length === 0 && (
            <div className="flex h-full items-center justify-center px-12 py-20">
              <p className="text-sm text-[var(--text-2)]">
                No history events yet. Click + to create one, or switch to the causal map.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryView({ bookId, tab, focusCardId, aiDock }: CanvasPageProps) {
  const rfRef = useRef<ReactFlowInstance<LoreNodeType, EdgeType> | null>(null);

  const st = useBibleTabState(bookId, tab, focusCardId);
  const {
    cards,
    setCards,
    links,
    allCards,
    selectedId,
    setSelectedId,
    selectedCard,
    selectedLinks,
    pendingConnection,
    pendingDelete,
    setPendingDelete,
    coachDismissed,
    dismissCoach,
    onSelectCard,
    handleRequestDelete,
    deleteCard,
    confirmConnection,
    handleConnect,
    handleCardChange,
    createCard,
    navigate,
  } = st;

  const [view, setView] = useState<"timeline" | "map">("timeline");
  const [isTidying, setIsTidying] = useState(false);

  const handleReorder = useCallback(
    (fromId: string, toX: number) => {
      setCards((prev) =>
        prev.map((c) => (c.id === fromId ? { ...c, x: toX } : c)),
      );
    },
    [setCards],
  );

  const handleNewCard = useCallback(() => {
    // For timeline: place at the end (rightmost)
    if (view === "timeline") {
      const maxX = cards.reduce((m, c) => Math.max(m, c.x), 0);
      createCard(maxX + 220, 60);
    } else {
      const inst = rfRef.current;
      const center = inst
        ? inst.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: (window.innerHeight - 56) / 2 + 56,
          })
        : { x: 240, y: 200 };
      createCard(center.x - 120, center.y - 40);
    }
  }, [view, cards, createCard]);

  const handleTab = useCallback(
    (t: BibleTab) => navigate({ name: "world", bookId, tab: t }),
    [navigate, bookId],
  );

  const handleJumpToCard = useCallback(
    (target: LoreCard) => {
      const targetTab = CATEGORY_TO_TAB[target.category];
      if (targetTab && targetTab !== tab) {
        navigate({ name: "world", bookId, tab: targetTab, focusCardId: target.id });
      } else if (target.category === "character") {
        navigate({ name: "cast", bookId, focusCardId: target.id });
      } else {
        setSelectedId(target.id);
        if (view === "map") {
          setTimeout(() => {
            rfRef.current?.setCenter(target.x + 120, target.y + 60, {
              zoom: 1.2,
              duration: 400,
            });
          }, 50);
        }
      }
    },
    [navigate, bookId, tab, setSelectedId, view],
  );

  // Canvas nodes/edges (for map view)
  const initialNodes = useMemo<LoreNodeType[]>(() => [], []);
  const [nodes, setNodes, onNodesChange] = useNodesState<LoreNodeType>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EdgeType>([]);

  useEffect(() => {
    if (view !== "map") return;
    setNodes((prev) => {
      const ids = new Set(cards.map((c) => c.id));
      const existing = new Set(prev.map((n) => n.id));
      const kept = prev
        .filter((n) => ids.has(n.id))
        .map((n) => {
          const c = cards.find((x) => x.id === n.id);
          if (!c) return n;
          return {
            ...n,
            position: flowPositions?.get(c.id) ?? { x: c.x, y: c.y },
            data: { card: c, onSelect: onSelectCard, onRequestDelete: handleRequestDelete },
            selected: n.id === selectedId,
          };
        });
      const added = cards
        .filter((c) => !existing.has(c.id))
        .map<LoreNodeType>((c) => ({
          id: c.id,
          type: "lore",
          position: flowPositions?.get(c.id) ?? { x: c.x, y: c.y },
          data: { card: c, onSelect: onSelectCard, onRequestDelete: handleRequestDelete },
          selected: c.id === selectedId,
        }));
      return [...kept, ...added];
    });
  }, [cards, selectedId, onSelectCard, handleRequestDelete, setNodes, view]);

  useEffect(() => {
    if (view !== "map") return;
    const ids = new Set(cards.map((c) => c.id));
    setEdges(() =>
      links
        .filter((l) => ids.has(l.source) && ids.has(l.target))
        .map<EdgeType>((l) => ({
          id: l.id,
          source: l.source,
          target: l.target,
          label: l.label,
          type: "default",
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#3f3f47" },
          animated: false,
        })),
    );
  }, [cards, links, setEdges, view]);

  const handleNodeDragStop = useCallback(
    (_evt: MouseEvent | TouchEvent, node: LoreNodeType) => {
      if (!node) return;
      setCards((prev) =>
        prev.map((c) =>
          c.id === node.id
            ? { ...c, x: Math.round(node.position.x), y: Math.round(node.position.y) }
            : c,
        ),
      );
    },
    [setCards],
  );

  const handleInit = useCallback(
    (inst: ReactFlowInstance<LoreNodeType, EdgeType>) => {
      rfRef.current = inst;
      if (!focusCardId) return;
      const card = cards.find((c) => c.id === focusCardId);
      if (!card) return;
      setTimeout(() => {
        inst.setCenter(card.x + 120, card.y + 60, { zoom: 1.2, duration: 400 });
      }, 60);
    },
    [focusCardId, cards],
  );

  // Auto-fit view when nodes first appear (async data load, map view only)
  const histHasFitRef = useRef(false);
  useEffect(() => {
    if (view === "map" && nodes.length > 0 && !histHasFitRef.current) {
      histHasFitRef.current = true;
      setTimeout(() => rfRef.current?.fitView({ padding: 0.25, maxZoom: 1.1 }), 100);
    }
  }, [nodes.length, view]);

  const isEmpty = cards.length === 0;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <style>{CANVAS_CSS}</style>
      {/* tab bar + view toggle */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-3">
        <div className="bh-scroll flex flex-1 items-center overflow-x-auto">
          {BIBLE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTab(t.id)}
              className={cn(
                "relative whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
                tab === t.id ? "text-accent" : "text-[var(--text-2)] hover:text-foreground",
              )}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>
        {/* view toggle */}
        <div className="ml-2 flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
          <button
            onClick={() => setView("timeline")}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
              view === "timeline"
                ? "bg-accent/15 text-accent"
                : "text-[var(--text-3)] hover:text-foreground",
            )}
          >
            Timeline
          </button>
          <button
            onClick={() => setView("map")}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
              view === "map"
                ? "bg-accent/15 text-accent"
                : "text-[var(--text-3)] hover:text-foreground",
            )}
          >
            Causal map
          </button>
        </div>
        <button
          onClick={handleNewCard}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="New card"
          title="New card"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => aiDock?.openWith(`History · ${cards.length} event${cards.length !== 1 ? "s" : ""}`, { bookId, tab })}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="AI"
          title="AI"
        >
          <Bot className="h-4 w-4" />
        </button>
      </div>

      {/* view content */}
      {view === "timeline" ? (
        <HistoryTimeline
          cards={cards}
          links={links}
          selectedId={selectedId}
          onSelect={onSelectCard}
          onReorder={handleReorder}
        />
      ) : (
        <div className="relative flex-1 overflow-hidden">
          <ReactFlow<LoreNodeType, EdgeType>
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeDragStop={viewMode === "canvas" ? handleNodeDragStop : undefined}
            nodeTypes={nodeTypes}
            onNodeClick={(_e, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            onInit={handleInit}
            connectionMode={ConnectionMode.Loose}
            snapToGrid
            snapGrid={[22, 22]}
            className={cn(isTidying && "bh-tidying")}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
            minZoom={0.2}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="rgba(255,255,255,0.22)"
              gap={24}
              size={1.6}
            />
            <Controls position="bottom-left" />
            <MiniMap position="bottom-right" pannable zoomable />
          </ReactFlow>
          {isEmpty && <EmptyStateOverlay onAction={handleNewCard} />}
        </div>
      )}

      {selectedCard && (
        <CardDrawer
          card={selectedCard}
          allCards={allCards}
          links={selectedLinks}
          currentTab={tab}
          onClose={() => setSelectedId(null)}
          onChange={handleCardChange}
          onJumpToCard={handleJumpToCard}
          onRequestDelete={handleRequestDelete}
        />
      )}

      {pendingConnection && (
        <ConnectionLabelPopover initialValue="" onConfirm={confirmConnection} />
      )}

      {pendingDelete && (
        <DeleteConfirmPopover
          onConfirm={() => {
            deleteCard(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/* ================================================================== *
 * BESTIARY VIEW — card grid (not canvas).
 * Filter chips on top (derived from tags/fields), search, card click
 * opens the same right-side drawer.
 * ================================================================== */

function BestiaryView({ bookId, tab, focusCardId, aiDock }: CanvasPageProps) {
  const st = useBibleTabState(bookId, tab, focusCardId);
  const {
    cards,
    allCards,
    selectedId,
    setSelectedId,
    selectedCard,
    selectedLinks,
    pendingDelete,
    setPendingDelete,
    handleRequestDelete,
    deleteCard,
    handleCardChange,
    handleJumpToCard,
    createCard,
    navigate,
  } = st;

  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  // Derive filter chips from tags (top 6 unique tags)
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) for (const t of c.tags) set.add(t);
    return [...set].slice(0, 8);
  }, [cards]);

  // Derive "threat" from fields (if any card has a "Threat" field)
  const hasThreatField = cards.some((c) =>
    c.fields.some((f) => f.label.toLowerCase().includes("threat")),
  );

  const filtered = useMemo(() => {
    let result = cards;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q) ||
          c.body.toLowerCase().includes(q),
      );
    }
    if (activeFilters.length > 0) {
      result = result.filter((c) =>
        activeFilters.every((f) => c.tags.includes(f)),
      );
    }
    return result;
  }, [cards, search, activeFilters]);

  const handleTab = useCallback(
    (t: BibleTab) => navigate({ name: "world", bookId, tab: t }),
    [navigate, bookId],
  );

  const handleNewCard = useCallback(() => {
    createCard(0, 0); // position doesn't matter for grid view
  }, [createCard]);

  const toggleFilter = (tag: string) => {
    setActiveFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* tab bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-3">
        <div className="bh-scroll flex flex-1 items-center overflow-x-auto">
          {BIBLE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTab(t.id)}
              className={cn(
                "relative whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
                tab === t.id ? "text-accent" : "text-[var(--text-2)] hover:text-foreground",
              )}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>
        <button
          onClick={handleNewCard}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="New card"
          title="New card"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => aiDock?.openWith(`Bestiary · ${cards.length} creature${cards.length !== 1 ? "s" : ""}`, { bookId, tab })}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="AI"
          title="AI"
        >
          <Bot className="h-4 w-4" />
        </button>
      </div>
      <div className="shrink-0 space-y-2 border-b border-border bg-background px-4 py-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search bestiary…"
          className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none sm:w-80"
        />
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
              Filter:
            </span>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleFilter(tag)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                  activeFilters.includes(tag)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-[var(--text-2)] hover:bg-[var(--surface-2)]",
                )}
              >
                {tag}
              </button>
            ))}
            {activeFilters.length > 0 && (
              <button
                onClick={() => setActiveFilters([])}
                className="text-[11px] text-[var(--text-3)] hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* grid */}
      <div className="bh-scroll flex-1 overflow-y-auto p-4 sm:p-6">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-[var(--text-2)]">
                {cards.length === 0
                  ? "No creatures yet — click + to add one."
                  : "No creatures match your filters."}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((card) => {
              const threatField = card.fields.find((f) =>
                f.label.toLowerCase().includes("threat"),
              );
              const habitatField = card.fields.find(
                (f) =>
                  f.label.toLowerCase().includes("habitat") ||
                  f.label.toLowerCase().includes("region"),
              );
              const deprecated = card.status === "deprecated";
              return (
                <button
                  key={card.id}
                  onClick={() => setSelectedId(card.id)}
                  className={cn(
                    "group flex flex-col rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-accent/40",
                    selectedId === card.id && "border-accent",
                    deprecated && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className={cn(
                        "text-sm font-semibold text-foreground",
                        deprecated && "line-through",
                      )}
                    >
                      {card.title}
                    </h3>
                    {card.status === "draft" && (
                      <span className="shrink-0 text-[9px] uppercase tracking-wide text-[var(--draft)]">
                        DRAFT
                      </span>
                    )}
                  </div>
                  {card.summary && (
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--text-2)]">
                      {card.summary}
                    </p>
                  )}
                  <div className="mt-3 space-y-1">
                    {threatField && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-[var(--text-3)]">Threat:</span>
                        <span className="text-foreground">{threatField.value}</span>
                      </div>
                    )}
                    {habitatField && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-[var(--text-3)]">Habitat:</span>
                        <span className="text-foreground">{habitatField.value}</span>
                      </div>
                    )}
                  </div>
                  {card.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {card.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-[var(--text-3)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedCard && (
        <CardDrawer
          card={selectedCard}
          allCards={allCards}
          links={selectedLinks}
          currentTab={tab}
          onClose={() => setSelectedId(null)}
          onChange={handleCardChange}
          onJumpToCard={handleJumpToCard}
          onRequestDelete={handleRequestDelete}
        />
      )}

      {pendingDelete && (
        <DeleteConfirmPopover
          onConfirm={() => {
            deleteCard(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
