"use client";

/* ------------------------------------------------------------------ *
 * World Bible — wiki edition.
 * The canvas/node graph is gone. Every tab is now: an Index (a plain
 * list of articles, searchable, click to open) and an Article (a full
 * page — title, status, summary, body, facts/infobox, tags, "See also"
 * links to other cards). One shape, reused across all 6 category tabs,
 * instead of a different bespoke view per tab.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

type PageProps = {
  bookId: string;
  tab?: BibleTab;
  focusCardId?: string;
  aiDock?: ReturnType<typeof useAiDock>;
};

type WikiTab = Exclude<BibleTab, "glossary">;
type WikiPageProps = {
  bookId: string;
  tab: WikiTab;
  focusCardId?: string;
  aiDock?: ReturnType<typeof useAiDock>;
};

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

function TabBar({
  active,
  onTab,
  onAi,
}: {
  active: BibleTab;
  onTab: (t: BibleTab) => void;
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

function DeleteConfirmPopover({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
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
        <p className="text-sm text-foreground">{message}</p>
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

function useBibleTabState(bookId: string, tab: WikiTab, focusCardId?: string) {
  const { navigate } = useRouter();

  const { data: cardsData } = useCards(bookId);
  const { data: linksData } = useLinks(bookId);
  const updateCardMut = useUpdateCard();
  const createCardMut = useCreateCard();
  const deleteCardMut = useDeleteCard();
  const createLinkMut = useCreateLink();
  const deleteLinkMut = useDeleteLink();

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

  const apiIdSet = useMemo(() => new Set(apiCards.map((c) => c.id)), [apiCards]);
  const [lastApiIdSet, setLastApiIdSet] = useState<Set<string>>(new Set());
  if (apiIdSet !== lastApiIdSet) {
    setLastApiIdSet(apiIdSet);
    const remainingTemps = tempCards.filter((c) => !apiIdSet.has(c.id));
    if (remainingTemps.length !== tempCards.length) setTempCards(remainingTemps);
    const newOverrides: Record<string, LoreCard> = {};
    for (const [id, card] of Object.entries(overrides)) {
      if (apiIdSet.has(id)) {
        const apiCard = apiCards.find((c) => c.id === id);
        if (apiCard && (
          card.title !== apiCard.title ||
          card.summary !== apiCard.summary ||
          card.body !== apiCard.body ||
          card.status !== apiCard.status ||
          card.sortOrder !== apiCard.sortOrder ||
          JSON.stringify(card.tags) !== JSON.stringify(apiCard.tags) ||
          JSON.stringify(card.fields) !== JSON.stringify(apiCard.fields)
        )) {
          newOverrides[id] = card;
        }
      } else {
        newOverrides[id] = card;
      }
    }
    if (Object.keys(newOverrides).length !== Object.keys(overrides).length) {
      setOverrides(newOverrides);
    }
    const remainingDeletes = new Set([...deletedIds].filter((id) => apiIdSet.has(id)));
    if (remainingDeletes.size !== deletedIds.size) setDeletedIds(remainingDeletes);
  }

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

  const updateCardLocal = useCallback((updated: LoreCard) => {
    setOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    updateCardMut.mutate({ id: updated.id, updates: updated });
  }, [updateCardMut]);

  const [selectedId, setSelectedId] = useState<string | null>(focusCardId ?? null);
  const [pendingConnection, setPendingConnection] = useState<{ source: string; target: string } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleRequestDelete = useCallback((id: string) => setPendingDeleteId(id), []);

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

  const requestConnection = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setPendingConnection({ source: sourceId, target: targetId });
  }, []);

  const confirmConnection = useCallback(
    (label: string | undefined) => {
      if (pendingConnection) {
        const tempId = `link-new-${Date.now()}`;
        setLinks((prev) => [...prev, {
          id: tempId,
          source: pendingConnection.source,
          target: pendingConnection.target,
          ...(label ? { label } : {}),
        }]);
        createLinkMut.mutate({
          bookId,
          input: { fromCardId: pendingConnection.source, toCardId: pendingConnection.target, label },
        });
      }
      setPendingConnection(null);
    },
    [pendingConnection, createLinkMut, bookId],
  );

  const removeLink = useCallback((linkId: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    deleteLinkMut.mutate(linkId);
  }, [deleteLinkMut]);

  const handleCardChange = useCallback((updated: LoreCard) => updateCardLocal(updated), [updateCardLocal]);

  const handleJumpToCard = useCallback(
    (target: LoreCard) => {
      const targetTab = CATEGORY_TO_TAB[target.category];
      if (target.category === "character") {
        navigate({ name: "cast", bookId, focusCardId: target.id });
      } else if (targetTab) {
        navigate({ name: "world", bookId, tab: targetTab, focusCardId: target.id });
      }
    },
    [navigate, bookId],
  );

  const createCard = useCallback(() => {
    const tempId = `card-new-${Date.now()}`;
    const newCard: LoreCard = {
      id: tempId,
      bookId,
      category: tab,
      title: "Untitled",
      summary: "",
      body: "",
      status: "draft",
      x: 0,
      y: 0,
      fields: [],
      tags: [],
    };
    setTempCards((prev) => [...prev, newCard]);
    setSelectedId(tempId);
    createCardMut.mutate({ bookId, input: { category: tab, title: "Untitled", x: 0, y: 0 } });
    navigate({ name: "world", bookId, tab, focusCardId: tempId });
    return tempId;
  }, [bookId, tab, createCardMut, navigate]);

  const selectedCard = selectedId ? cards.find((c) => c.id === selectedId) ?? null : null;
  const selectedLinks = useMemo<CardLink[]>(
    () => (selectedCard ? links.filter((l) => l.source === selectedCard.id || l.target === selectedCard.id) : []),
    [selectedCard, links],
  );

  return {
    cards,
    links,
    allCards,
    selectedId,
    setSelectedId,
    selectedCard,
    selectedLinks,
    pendingConnection,
    pendingDeleteId,
    setPendingDeleteId,
    handleRequestDelete,
    deleteCard,
    requestConnection,
    confirmConnection,
    removeLink,
    handleCardChange,
    handleJumpToCard,
    createCard,
    navigate,
  };
}

function hybridOrder(cards: LoreCard[]): LoreCard[] {
  return [...cards].sort((a, b) => {
    const aHas = a.sortOrder != null;
    const bHas = b.sortOrder != null;
    if (aHas && bHas) return (a.sortOrder as number) - (b.sortOrder as number);
    if (aHas) return -1;
    if (bHas) return 1;
    return a.title.localeCompare(b.title);
  });
}

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group/row flex items-center gap-1", isDragging && "z-10 opacity-70")}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none rounded p-1 text-[var(--text-3)] opacity-0 transition-opacity hover:bg-[var(--surface-2)] hover:text-foreground active:cursor-grabbing group-hover/row:opacity-100"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function WikiIndex({ bookId, tab }: WikiPageProps) {
  const st = useBibleTabState(bookId, tab);
  const { cards, handleCardChange, createCard, navigate } = st;
  const [search, setSearch] = useState("");

  const ordered = useMemo(() => hybridOrder(cards), [cards]);
  const filtered = useMemo(() => {
    if (!search.trim()) return ordered;
    const q = search.toLowerCase();
    return ordered.filter((c) => c.title.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q));
  }, [ordered, search]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = ordered.findIndex((c) => c.id === active.id);
      const newIndex = ordered.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(ordered, oldIndex, newIndex);
      reordered.forEach((c, i) => {
        if (c.sortOrder !== i) handleCardChange({ ...c, sortOrder: i });
      });
    },
    [ordered, handleCardChange],
  );

  return (
    <div className="bh-scroll flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${CATEGORY_LABEL[tab] ?? tab}…`}
              className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
            />
          </div>
          <button
            onClick={() => createCard()}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/15"
          >
            <Plus className="h-3.5 w-3.5" /> New article
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm text-foreground">
              {search ? `Nothing matches "${search}"` : "No articles yet"}
            </p>
            {!search && (
              <button onClick={() => createCard()} className="text-xs text-accent hover:underline">
                Write the first one
              </button>
            )}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filtered.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                {filtered.map((card) => (
                  <SortableRow key={card.id} id={card.id}>
                    <button
                      onClick={() => navigate({ name: "world", bookId, tab, focusCardId: card.id })}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[var(--surface-2)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{card.title}</span>
                          {card.status !== "canon" && (
                            <span className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                              card.status === "draft" ? "bg-[var(--draft)]/15 text-[var(--draft)]" : "bg-[var(--surface-2)] text-[var(--text-3)]",
                            )}>
                              {STATUS_LABEL[card.status]}
                            </span>
                          )}
                        </div>
                        {card.summary && (
                          <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">{card.summary}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
                    </button>
                  </SortableRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function WikiArticle({ bookId, tab, focusCardId }: WikiPageProps) {
  const st = useBibleTabState(bookId, tab, focusCardId);
  const {
    allCards, selectedCard, selectedLinks,
    pendingConnection, pendingDeleteId, setPendingDeleteId,
    handleRequestDelete, deleteCard, requestConnection, confirmConnection, removeLink,
    handleCardChange, handleJumpToCard, navigate,
  } = st;

  const [newTag, setNewTag] = useState("");
  const [showAddFact, setShowAddFact] = useState(false);
  const [newFact, setNewFact] = useState({ label: "", value: "" });
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");

  const card = selectedCard;

  const connections = useMemo(() => {
    if (!card) return [];
    return selectedLinks
      .map((l) => {
        const otherId = l.source === card.id ? l.target : l.target === card.id ? l.source : null;
        if (!otherId) return null;
        const other = allCards.find((c) => c.id === otherId);
        if (!other) return null;
        return { link: l, other };
      })
      .filter((x): x is { link: CardLink; other: LoreCard } => x !== null);
  }, [card, selectedLinks, allCards]);

  const linkResults = useMemo(() => {
    if (!card || !linkQuery.trim()) return [];
    const q = linkQuery.toLowerCase();
    const connectedIds = new Set(connections.map((c) => c.other.id));
    return allCards
      .filter((c) => c.id !== card.id && !connectedIds.has(c.id) && c.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [card, linkQuery, allCards, connections]);

  function commitFact() {
    if (!card || !newFact.label.trim()) return;
    handleCardChange({ ...card, fields: [...card.fields, { ...newFact }] });
    setNewFact({ label: "", value: "" });
    setShowAddFact(false);
  }

  if (!card) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-foreground">This article doesn't exist (or was deleted).</p>
        <button
          onClick={() => navigate({ name: "world", bookId, tab })}
          className="flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to index
        </button>
      </div>
    );
  }

  return (
    <div className="bh-scroll flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <button
          onClick={() => navigate({ name: "world", bookId, tab })}
          className="mb-4 flex items-center gap-1.5 text-xs text-[var(--text-3)] hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> {CATEGORY_LABEL[tab]}
        </button>

        <input
          value={card.title}
          onChange={(e) => handleCardChange({ ...card, title: e.target.value })}
          className="mb-1 w-full bg-transparent font-serif text-3xl font-semibold text-foreground focus:outline-none"
        />
        <div className="mb-5 flex w-fit items-center gap-1 rounded-md border border-border p-0.5">
          {(["canon", "draft", "deprecated"] as CanonStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => handleCardChange({ ...card, status: s })}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                card.status === s
                  ? s === "canon" ? "bg-accent/15 text-accent" : s === "draft" ? "bg-[var(--draft)]/15 text-[var(--draft)]" : "bg-[var(--surface-2)] text-[var(--text-3)]"
                  : "text-[var(--text-3)] hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <textarea
          value={card.summary}
          onChange={(e) => handleCardChange({ ...card, summary: e.target.value })}
          placeholder="One-line summary…"
          rows={2}
          className="mb-5 w-full resize-none bg-transparent text-sm italic text-[var(--text-2)] focus:outline-none"
        />

        <textarea
          value={card.body}
          onChange={(e) => handleCardChange({ ...card, body: e.target.value })}
          placeholder="Write the article…"
          rows={10}
          className="mb-8 w-full resize-y rounded-md border border-transparent bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground transition-colors focus:border-border focus:bg-[var(--surface-2)] focus:outline-none"
        />

        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">Facts</div>
          <div className="space-y-1.5">
            {card.fields.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 text-[var(--text-3)]">{f.label}</span>
                <span className="min-w-0 flex-1 text-foreground">{f.value}</span>
                <button
                  onClick={() => handleCardChange({ ...card, fields: card.fields.filter((_, j) => j !== i) })}
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
                  onChange={(e) => setNewFact({ ...newFact, label: e.target.value })}
                  placeholder="Label"
                  className="w-28 rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                />
                <input
                  value={newFact.value}
                  onChange={(e) => setNewFact({ ...newFact, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitFact(); }
                    else if (e.key === "Escape") { setNewFact({ label: "", value: "" }); setShowAddFact(false); }
                  }}
                  placeholder="Value"
                  autoFocus
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                />
                <button onClick={commitFact} className="rounded p-1 text-[var(--text-3)] hover:text-foreground" aria-label="Confirm add">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAddFact(true)} className="pt-0.5 text-xs text-[var(--text-3)] hover:text-foreground">
                + Add fact
              </button>
            )}
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">Tags</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {card.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs text-[var(--text-2)]">
                {t}
                <button
                  onClick={() => handleCardChange({ ...card, tags: card.tags.filter((x) => x !== t) })}
                  className="text-[var(--text-3)] hover:text-destructive"
                  aria-label={`Remove ${t}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) {
                  e.preventDefault();
                  const v = newTag.trim();
                  if (!card.tags.includes(v)) handleCardChange({ ...card, tags: [...card.tags, v] });
                  setNewTag("");
                }
              }}
              placeholder="+ tag"
              className="w-20 rounded border border-transparent bg-transparent px-1 py-1 text-xs text-foreground outline-none focus:border-border"
            />
          </div>
        </div>

        <div className="mb-10">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">See also</span>
            <button
              onClick={() => { setLinkPickerOpen((v) => !v); setLinkQuery(""); }}
              className="text-xs text-accent hover:underline"
            >
              {linkPickerOpen ? "Cancel" : "+ Link an article"}
            </button>
          </div>
          {linkPickerOpen && (
            <div className="relative mb-3">
              <input
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Search articles to link…"
                autoFocus
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-accent"
              />
              {linkResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-lg">
                  {linkResults.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        requestConnection(card.id, r.id);
                        setLinkPickerOpen(false);
                        setLinkQuery("");
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[var(--surface-2)]"
                    >
                      <span className="text-foreground">{r.title}</span>
                      <span className="text-[var(--text-3)]">{CATEGORY_LABEL[r.category]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {connections.length === 0 ? (
            <p className="text-xs text-[var(--text-3)]">No linked articles yet.</p>
          ) : (
            <div className="space-y-1">
              {connections.map(({ link, other }) => {
                const crossTab = CATEGORY_TO_TAB[other.category] !== tab || other.category === "character";
                return (
                  <div key={link.id} className="group/link flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                    <button
                      onClick={() => handleJumpToCard(other)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="truncate text-xs text-foreground">{other.title}</span>
                      <span className="shrink-0 text-[10px] text-[var(--text-3)]">{link.label ?? "related"}</span>
                      {crossTab && (
                        <span className="ml-auto flex shrink-0 items-center gap-1 rounded border border-border bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--text-3)]">
                          <ArrowUpRight className="h-2.5 w-2.5" /> {CATEGORY_LABEL[other.category]}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => removeLink(link.id)}
                      className="shrink-0 text-[var(--text-3)] opacity-0 transition-opacity hover:text-destructive group-hover/link:opacity-100"
                      aria-label="Remove link"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
            <Check className="h-3 w-3" /> Auto-saved
          </span>
          <button
            onClick={() => handleRequestDelete(card.id)}
            className="flex items-center gap-1 text-xs text-destructive hover:underline"
          >
            <Trash2 className="h-3 w-3" /> Delete article
          </button>
        </div>
      </div>

      {pendingConnection && (
        <ConnectionLabelPopover initialValue="" onConfirm={confirmConnection} />
      )}
      {pendingDeleteId && (
        <DeleteConfirmPopover
          message="Delete this article? Its connections will also be removed."
          onConfirm={() => { deleteCard(pendingDeleteId); setPendingDeleteId(null); navigate({ name: "world", bookId, tab }); }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}

function WikiTabPage({ bookId, tab, focusCardId }: WikiPageProps) {
  if (focusCardId) {
    return <WikiArticle bookId={bookId} tab={tab} focusCardId={focusCardId} />;
  }
  return <WikiIndex bookId={bookId} tab={tab} />;
}

export function WorldBiblePage({ bookId, tab, focusCardId }: PageProps) {
  const aiDock = useAiDock();
  const [searchOpen, setSearchOpen] = useState(false);
  const { navigate } = useRouter();

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

  const { data: allSearchCards } = useCards(bookId);

  function handleSearchJump(card: LoreCard) {
    setSearchOpen(false);
    if (card.category === "character") {
      aiDock.setOpen(false);
      navigate({ name: "cast", bookId, focusCardId: card.id });
      return;
    }
    const targetTab = CATEGORY_TO_TAB[card.category];
    if (targetTab) navigate({ name: "world", bookId, tab: targetTab, focusCardId: card.id });
  }

  if (!tab) {
    return (
      <>
        <WorldOverview bookId={bookId} />
        <AiDock open={aiDock.open} scope={aiDock.scope} scopeData={aiDock.scopeData} onClose={() => aiDock.setOpen(false)} />
      </>
    );
  }

  if (tab === "glossary") {
    return (
      <>
        <GlossaryPage bookId={bookId} aiDock={aiDock} />
        <AiDock open={aiDock.open} scope={aiDock.scope} scopeData={aiDock.scopeData} onClose={() => aiDock.setOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <TabBar
          active={tab}
          onTab={(t) => navigate({ name: "world", bookId, tab: t })}
          onAi={() => aiDock.setOpen(true)}
        />
        <WikiTabPage key={`${bookId}-${tab}-${focusCardId ?? "index"}`} bookId={bookId} tab={tab} focusCardId={focusCardId} />
      </div>
      <AiDock open={aiDock.open} scope={aiDock.scope} scopeData={aiDock.scopeData} onClose={() => aiDock.setOpen(false)} />
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
