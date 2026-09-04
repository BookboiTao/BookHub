"use client";

/* ------------------------------------------------------------------ *
 * CastPage — sheets-first character workspace.
 *
 * Three views:
 *   - "list": grid of character cards (default)
 *   - "sheet": single character sheet (editable identity/arc/voice)
 *   - "map": read-only relationship canvas
 *
 * Characters live as cards (category="character") in the same graph
 * as lore cards. The store holds them with x/y for canvas positioning.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { ArrowUpRight, Bot, ChevronLeft, Users } from "lucide-react";
import { useAiDock, AiDock } from "../ai-dock";
import {
  type CardLink,
  type Chapter,
  type ChapterState,
  type LoreCard,
} from "@/lib/data-client";
import { useCards, useLinks, useChapters, useStates, useUpdateCard, LoadingSpinner } from "@/lib/hooks";
import { useRouter } from "../router";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Field helpers
 * ------------------------------------------------------------------ */

function fieldValue(card: LoreCard, label: string): string | undefined {
  return card.fields.find((f) => f.label === label)?.value;
}

function setFieldValue(card: LoreCard, label: string, value: string): LoreCard {
  const idx = card.fields.findIndex((f) => f.label === label);
  if (idx === -1) {
    return { ...card, fields: [...card.fields, { label, value }] };
  }
  const nextFields = card.fields.slice();
  nextFields[idx] = { ...nextFields[idx], value };
  return { ...card, fields: nextFields };
}

/* ------------------------------------------------------------------ *
 * Edge color by relationship label
 *   hunts / hunted by    → red
 *   guardian of / watched by → emerald
 *   commanded by / family → amber
 *   default              → grey (--edge)
 * ------------------------------------------------------------------ */

function edgeColor(label?: string): string {
  if (!label) return "#3f3f47";
  const l = label.toLowerCase();
  if (l === "hunts" || l === "hunted by") return "#f87171";
  if (l === "guardian of" || l === "watched by") return "#34d399";
  if (l === "commanded by" || l.includes("family")) return "#fbbf24";
  return "#3f3f47";
}

/* ------------------------------------------------------------------ *
 * First-appears lookup — search chapter content for `@CharacterName`.
 * Returns the lowest-numbered main-branch chapter that contains the
 * mention, or undefined.
 * ------------------------------------------------------------------ */

function firstAppearsChapter(
  characterName: string,
  chapters: Chapter[],
): Chapter | undefined {
  const needle = `@${characterName}`;
  const mainBranch = chapters
    .filter((c) => c.branchId === "main")
    .sort((a, b) => a.number - b.number);
  for (const ch of mainBranch) {
    if (ch.content && ch.content.includes(needle)) return ch;
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Character node for the map view — same flat aesthetic as world-bible
 * lore nodes, but shows name + role.
 * ------------------------------------------------------------------ */

type CharacterNodeData = {
  card: LoreCard;
  onOpen: (id: string) => void;
};

function CharacterNode({ data }: NodeProps) {
  const { card, onOpen } = data as CharacterNodeData;
  const role = fieldValue(card, "Role");

  return (
    <div
      onClick={() => onOpen(card.id)}
      className="group relative w-[220px] cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:border-accent/40"
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!left-1/2 !-top-[3px] !h-1.5 !w-1.5 !-translate-x-1/2"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!left-1/2 !-bottom-[3px] !h-1.5 !w-1.5 !-translate-x-1/2"
      />

      <div className="flex items-start gap-2">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-foreground">
            {card.title}
          </div>
          {role && (
            <div className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">
              {role}
            </div>
          )}
        </div>
      </div>

      {card.status === "draft" && (
        <div className="absolute right-2 top-2 text-[10px] uppercase tracking-wide text-[var(--draft)]">
          DRAFT
        </div>
      )}
    </div>
  );
}

const nodeTypes = { character: CharacterNode };

/* ------------------------------------------------------------------ *
 * LIST view
 * ------------------------------------------------------------------ */

function CharacterListCard({
  card,
  chapters,
  onOpen,
}: {
  card: LoreCard;
  chapters: Chapter[];
  onOpen: (id: string) => void;
}) {
  const role = fieldValue(card, "Role");
  const arc = fieldValue(card, "Arc");
  const firstCh = firstAppearsChapter(card.title, chapters);

  return (
    <button
      onClick={() => onOpen(card.id)}
      className="group relative cursor-pointer rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-base font-medium text-foreground">
            {card.title}
          </div>
          {role && (
            <div className="mt-0.5 text-sm text-[var(--text-2)]">{role}</div>
          )}
        </div>
        {card.status === "draft" && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--draft)]">
            DRAFT
          </span>
        )}
      </div>

      {arc && (
        <div className="mt-3">
          <span className="inline-block max-w-full truncate rounded border border-border px-1.5 py-0.5 text-xs text-[var(--text-3)] align-bottom">
            {arc}
          </span>
        </div>
      )}

      {firstCh && (
        <div className="mt-3 text-xs text-[var(--text-3)]">
          First appears: Ch {firstCh.number}
        </div>
      )}
    </button>
  );
}

function CastList({
  characters,
  chapters,
  onOpen,
  onToggleMap,
  onAi,
}: {
  characters: LoreCard[];
  chapters: Chapter[];
  onOpen: (id: string) => void;
  onToggleMap: () => void;
  onAi: () => void;
}) {
  return (
    <div className="mx-auto max-w-5xl p-6 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Cast</h1>
          <p className="mt-1 text-sm text-[var(--text-2)]">Your characters.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAi}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
            aria-label="AI"
            title="AI"
          >
            <Bot className="h-4 w-4" />
          </button>
          <button
            onClick={onToggleMap}
            className="border border-border rounded-md px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            Map view
          </button>
        </div>
      </div>

      {characters.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Users className="mx-auto h-6 w-6 text-[var(--text-3)]" />
          <p className="mt-2 text-sm text-[var(--text-2)]">No characters yet.</p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">
            Add a character to start building the cast.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <CharacterListCard
              key={c.id}
              card={c}
              chapters={chapters}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * SHEET view — single character, editable identity/arc/voice
 * ------------------------------------------------------------------ */

function EditableFieldRow({
  label,
  value,
  onCommit,
  multiline = false,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  multiline?: boolean;
}) {
  // Local draft synced to the prop via reset-on-prop-change pattern.
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const inputClasses =
    "w-full resize-none rounded-sm border border-transparent bg-transparent px-2 py-1.5 text-sm leading-relaxed text-foreground transition-colors focus:border-border focus:bg-[var(--surface-2)] focus:outline-none";

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <div className="pt-1.5 text-xs uppercase tracking-wide text-[var(--text-3)]">
        {label}
      </div>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onCommit(draft);
          }}
          rows={3}
          className={inputClasses}
        />
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onCommit(draft);
          }}
          className={inputClasses}
        />
      )}
    </div>
  );
}

function CharacterSheet({
  card,
  links,
  allCards,
  states,
  chapters,
  onBack,
  onCommit,
  onNavigate,
}: {
  card: LoreCard;
  links: CardLink[];
  allCards: LoreCard[];
  states: ChapterState[];
  chapters: Chapter[];
  onBack: () => void;
  onCommit: (next: LoreCard) => void;
  onNavigate: (otherCardId: string) => void;
}) {
  const arc = fieldValue(card, "Arc") ?? "";
  const voice = fieldValue(card, "Voice") ?? "";
  const knows = fieldValue(card, "Knows");
  const doesntKnow = fieldValue(card, "Doesn't know");

  // Identity fields = all fields EXCEPT the ones that get their own sections
  // (Arc / Voice / Knows / Doesn't know).
  const identityFields = card.fields.filter(
    (f) =>
      f.label !== "Arc" &&
      f.label !== "Voice" &&
      f.label !== "Knows" &&
      f.label !== "Doesn't know",
  );

  // Connections to/from this character (both directions). Each entry has the
  // link + the "other" card. Split by whether the other card is a character
  // (→ Relationships) or a lore card (→ Bible cards).
  const connections = links
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
    .filter(Boolean) as { link: CardLink; other: LoreCard }[];

  const charRelationships = connections.filter(
    (x) => x.other.category === "character",
  );
  const bibleLinks = connections.filter(
    (x) => x.other.category !== "character",
  );

  // Latest chapter state — the one whose chapter has the highest number.
  const latestState = useMemo(() => {
    if (states.length === 0) return null;
    const chapterById = new Map(chapters.map((c) => [c.id, c]));
    let best: { state: ChapterState; number: number } | null = null;
    for (const s of states) {
      const ch = chapterById.get(s.chapterId);
      const num = ch?.number ?? 0;
      if (!best || num > best.number) {
        best = { state: s, number: num };
      }
    }
    return best?.state ?? null;
  }, [states, chapters]);

  const commitField = (label: string, value: string) =>
    onCommit(setFieldValue(card, label, value));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 sm:p-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-[var(--text-2)] transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Cast
      </button>

      {/* Identity */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <input
            value={card.title}
            onChange={(e) => onCommit({ ...card, title: e.target.value })}
            className="min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-2 py-1 font-serif text-3xl font-semibold text-foreground transition-colors focus:border-border focus:bg-[var(--surface-2)] focus:outline-none"
          />
          {card.status === "draft" && (
            <span className="mt-3 shrink-0 text-[10px] uppercase tracking-wide text-[var(--draft)]">
              DRAFT
            </span>
          )}
        </div>
        {/* Description */}
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-3)]">
            Description
          </label>
          <textarea
            value={card.summary}
            onChange={(e) => onCommit({ ...card, summary: e.target.value })}
            placeholder="Who is this character? A one-line summary that grounds them."
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
          />
        </div>
        <div className="space-y-2">
          {identityFields.map((f) => (
            <EditableFieldRow
              key={f.label}
              label={f.label}
              value={f.value}
              onCommit={(next) => commitField(f.label, next)}
            />
          ))}
        </div>
      </section>

      {/* Arc */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wide text-[var(--text-3)]">
            Arc
          </div>
          <span className="text-[10px] text-[var(--text-3)]/60">
            — where do they start, and where do they end up?
          </span>
        </div>
        <EditableFieldRow
          label="Arc"
          value={arc}
          onCommit={(next) => commitField("Arc", next)}
          multiline
        />
      </section>

      {/* Voice notes */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wide text-[var(--text-3)]">
            Voice notes
          </div>
          <span className="text-[10px] text-[var(--text-3)]/60">
            — how do they talk? Catchphrases, rhythm, vocabulary level.
          </span>
        </div>
        <EditableFieldRow
          label="Voice"
          value={voice}
          onCommit={(next) => commitField("Voice", next)}
          multiline
        />
      </section>

      {/* Knows / Doesn't know */}
      {(knows || doesntKnow) && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-[var(--text-3)]">
              Knows
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              {knows ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-[var(--text-3)]">
              Doesn&apos;t know
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              {doesntKnow ?? "—"}
            </p>
          </div>
        </section>
      )}

      {/* Relationships to other characters */}
      {charRelationships.length > 0 && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-6">
          <div className="text-xs uppercase tracking-wide text-[var(--text-3)]">
            Relationships
          </div>
          <div className="space-y-1.5">
            {charRelationships.map(({ link, other }) => (
              <button
                key={link.id}
                onClick={() => onNavigate(other.id)}
                className="group flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {other.title}
                  </div>
                  {link.label && (
                    <div className="truncate text-xs text-[var(--text-3)]">
                      {link.label}
                    </div>
                  )}
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)] group-hover:text-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Links to Bible cards */}
      {bibleLinks.length > 0 && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-6">
          <div className="text-xs uppercase tracking-wide text-[var(--text-3)]">
            Bible cards
          </div>
          <div className="space-y-1.5">
            {bibleLinks.map(({ link, other }) => (
              <button
                key={link.id}
                onClick={() => onNavigate(other.id)}
                className="group flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {other.title}
                  </div>
                  <div className="truncate text-xs text-[var(--text-3)]">
                    <span className="uppercase">{other.category}</span>
                    {link.label && ` · ${link.label}`}
                  </div>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)] group-hover:text-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Knowledge as of latest State */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-6">
        <div className="text-xs uppercase tracking-wide text-[var(--text-3)]">
          {latestState
            ? `Knowledge as of ${latestState.label}`
            : "Chapter states"}
        </div>
        {latestState ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
                Present
              </div>
              <div className="text-sm text-[var(--text-2)]">
                {latestState.present.join(" · ")}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
                Knows
              </div>
              <ul className="space-y-1.5">
                {latestState.knowledge.map((k, i) => {
                  const isMe =
                    k.who === card.title ||
                    k.who.toLowerCase() === card.title.toLowerCase();
                  return (
                    <li
                      key={i}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm",
                        isMe
                          ? "border-accent/40 bg-accent/5 text-foreground"
                          : "border-border bg-background text-[var(--text-2)]",
                      )}
                    >
                      <span className="mr-2 text-xs font-medium text-[var(--text-3)]">
                        {k.who}
                      </span>
                      {k.knows}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-3)]">
            No chapter states recorded.
          </p>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * MAP view — read-only relationship canvas
 * ------------------------------------------------------------------ */

function CastMap({
  characters,
  links,
  onOpen,
  onBack,
}: {
  characters: LoreCard[];
  links: CardLink[];
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  // Only character↔character edges.
  const charLinkEdges = useMemo(
    () =>
      links.filter(
        (l) =>
          characters.some((c) => c.id === l.source) &&
          characters.some((c) => c.id === l.target),
      ),
    [links, characters],
  );

  const nodes: Node[] = useMemo(
    () =>
      characters.map((c) => ({
        id: c.id,
        type: "character",
        position: { x: c.x, y: c.y },
        data: { card: c, onOpen },
      })),
    [characters, onOpen],
  );

  const edges: Edge[] = useMemo(
    () =>
      charLinkEdges.map((l) => ({
        id: l.id,
        source: l.source,
        target: l.target,
        label: l.label,
        labelStyle: { fontSize: 11, fill: "var(--text-2)" },
        labelBgStyle: { fill: "var(--background)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        type: "smoothstep",
        style: { stroke: edgeColor(l.label), strokeWidth: 1.5 },
      })),
    [charLinkEdges],
  );

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full">
      <div className="absolute left-4 top-4 z-10 space-y-2 rounded-md border border-border bg-card/80 px-3 py-2 backdrop-blur">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-[var(--text-2)] transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Cast
        </button>
        <div className="text-sm font-semibold">Relationship map</div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="rgba(255,255,255,0.1)"
          gap={24}
          size={1}
        />
        <MiniMap
          pannable
          zoomable
          nodeColor={() => "#1a1a1e"}
          maskColor="rgba(12,12,14,0.7)"
          className="!bg-card"
        />
        <Controls
          className="!rounded-md !border !border-border"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export function CastPage({
  bookId,
  focusCardId,
}: {
  bookId: string;
  focusCardId?: string;
}) {
  const { navigate } = useRouter();
  const aiDock = useAiDock();

  const { data: cardsData, isLoading } = useCards(bookId);
  const { data: linksData } = useLinks(bookId);
  const { data: chaptersData } = useChapters(bookId);
  const { data: statesData } = useStates(bookId);
  const updateCard = useUpdateCard();
  const [view, setView] = useState<"list" | "sheet" | "map">(
    focusCardId ? "sheet" : "list",
  );
  const [selectedCharId, setSelectedCharId] = useState<string | null>(
    focusCardId ?? null,
  );

  // Reset-on-prop-change for focusCardId (e.g. deep-link nav from another
  // page, or clicking a relationship in the sheet). Done during render to
  // avoid setState-in-effect.
  const [lastFocus, setLastFocus] = useState(focusCardId);
  if (focusCardId !== lastFocus) {
    setLastFocus(focusCardId);
    if (focusCardId) {
      setSelectedCharId(focusCardId);
      setView("sheet");
    } else {
      setSelectedCharId(null);
      setView("list");
    }
  }

  const characters = useMemo(
    () =>
      (cardsData ?? []).filter(
        (c) => c.bookId === bookId && c.category === "character",
      ),
    [cardsData, bookId],
  );
  const allCards = useMemo(
    () => (cardsData ?? []).filter((c) => c.bookId === bookId),
    [cardsData, bookId],
  );
  const links = useMemo(
    () =>
      (linksData ?? []).filter(
        (l) =>
          allCards.some((c) => c.id === l.source) ||
          allCards.some((c) => c.id === l.target),
      ),
    [linksData, allCards],
  );
  const chapters = useMemo(
    () => (chaptersData ?? []).filter((c) => c.bookId === bookId),
    [chaptersData, bookId],
  );
  const states = statesData ?? [];

  const selectedCard = useMemo(
    () => characters.find((c) => c.id === selectedCharId) ?? null,
    [characters, selectedCharId],
  );

  // Defensive: if we're in sheet view but the selected card is missing
  // (bad focus id or stale state), fall back to list view.
  if (view === "sheet" && !selectedCard && selectedCharId !== null) {
    setView("list");
    setSelectedCharId(null);
  }

  const commitCard = useCallback(
    (next: LoreCard) => {
      updateCard.mutate({ id: next.id, updates: next });
    },
    [updateCard],
  );

  const openSheet = useCallback(
    (id: string) => {
      setSelectedCharId(id);
      setView("sheet");
      navigate({ name: "cast", bookId, focusCardId: id });
    },
    [navigate, bookId],
  );

  const backToList = useCallback(() => {
    setSelectedCharId(null);
    setView("list");
    if (focusCardId) navigate({ name: "cast", bookId });
  }, [navigate, bookId, focusCardId]);

  const navigateToCard = useCallback(
    (otherCardId: string) => {
      const other = allCards.find((c) => c.id === otherCardId);
      if (!other) return;
      if (other.category === "character") {
        // Stay in Cast — switch to that character's sheet.
        setSelectedCharId(other.id);
        setView("sheet");
        navigate({ name: "cast", bookId, focusCardId: other.id });
      } else {
        navigate({
          name: "world",
          bookId,
          tab: other.category,
          focusCardId: other.id,
        });
      }
    },
    [allCards, navigate, bookId],
  );

  if (view === "map") {
    return (
      <CastMap
        characters={characters}
        links={links}
        onOpen={openSheet}
        onBack={backToList}
      />
    );
  }

  if (view === "sheet" && selectedCard) {
    return (
      <CharacterSheet
        card={selectedCard}
        links={links}
        allCards={allCards}
        states={states}
        chapters={chapters}
        onBack={backToList}
        onCommit={commitCard}
        onNavigate={navigateToCard}
      />
    );
  }

  return (
    <>
      <CastList
        characters={characters}
        chapters={chapters}
        onOpen={openSheet}
        onToggleMap={() => setView("map")}
        onAi={() => aiDock.openWith(`Cast · ${characters.length} character${characters.length !== 1 ? "s" : ""}`, { bookId, tab: "character" })}
      />
      <AiDock open={aiDock.open} scope={aiDock.scope} scopeData={aiDock.scopeData} onClose={() => aiDock.setOpen(false)} />
    </>
  );
}
