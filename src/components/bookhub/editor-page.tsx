"use client";

/* ------------------------------------------------------------------ *
 * Chapter editor — 3-pane shell.
 *
 * Layout: top bar (56px) + left rail (240px→44px) + center prose +
 * right panel (360px→0) + status strip (32px).
 *
 * Loads chapter title/content from the localStorage mock store by id.
 * All carry-over logic from the previous editor preserved:
 *   - useReadAloud hook (SpeechSynthesis wrapper)
 *   - extractMentions regex
 *   - WhyModal (draft/publish modes)
 *   - StubToast (@mention auto-stub)
 *   - DraftHistory (searchable, Main badge)
 *   - CrutchWordPanel (imported as-is)
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  History,
  Check,
  FileText,
  Eye,
  Maximize2,
  Volume2,
  Square,
  Play,
  Sparkles,
  X,
  Search,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Wrench,
  ArrowUpRight,
  Pin,
  BookText,
  Trash2,
  Bot,
  Send,
} from "lucide-react";
import { useRouter } from "./router";
import { CrutchWordPanel } from "./crutch-word-panel";
import { AiChatPanel, type ChatMessage, type ContinuePreview } from "./ai-chat-panel";
import { cn } from "@/lib/utils";
import { useChapters, useCards, useGlossaryTerms, useStates, useUpdateChapter, useCreateGlossaryTerm, useCreateChapter, useCreateCard, useDrafts, useCreateDraft, useDeleteDraft } from "@/lib/hooks";
import {
  type Chapter,
  type GlossaryTerm,
  type LoreCard,
} from "@/lib/data-client";

/* ================================================================== *
 * useReadAloud — browser SpeechSynthesis, zero backend
 * ================================================================== */

function useReadAloud() {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const rateRef = useRef(0.95);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rateRef.current;
    u.pitch = 1;
    u.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utterRef.current = u;
    window.speechSynthesis.speak(u);
    setSpeaking(true);
    setPaused(false);
  }, []);

  const pause = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }, []);

  const setRate = useCallback((r: number) => {
    rateRef.current = r;
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { speaking, paused, speak, pause, resume, stop, setRate };
}

/* ================================================================== *
 * extractMentions — pull @Names from the prose
 * ================================================================== */

function extractMentions(text: string): string[] {
  const matches = text.match(/@([A-Z][a-zA-Z]+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

/* Seed character name → card id lookup. The regex pulls the first
 * Capitalized word from an @mention, so `@Idris` extracts "Idris" even
 * though the seed character card is titled "Commander Idris". This lookup
 * bridges that gap so the StubToast "View in Cast" link and the Lore-tab
 * auto-cards resolve to the right character. */
const SEED_CHAR_NAME_TO_ID: Record<string, string> = {
  elias: "char-elias",
  maren: "char-maren",
  idris: "char-idris",
  bellkeeper: "char-bellkeeper",
};

/** Find a character LoreCard by @mention name. Tries the seed name→id
 * lookup first (covers multi-word titles like "Commander Idris"), then
 * falls back to a case-insensitive exact-title match for custom cards. */
function findCharCardByName(
  allCards: LoreCard[],
  bookId: string,
  name: string,
): LoreCard | undefined {
  const lower = name.toLowerCase();
  const seedId = SEED_CHAR_NAME_TO_ID[lower];
  if (seedId) {
    const byId = allCards.find((c) => c.id === seedId && c.bookId === bookId);
    if (byId) return byId;
  }
  return allCards.find(
    (c) =>
      c.bookId === bookId &&
      c.category === "character" &&
      c.title.toLowerCase() === lower,
  );
}

/* ================================================================== *
 * SavedDraft type + seed drafts
 * ================================================================== */

type SavedDraft = {
  id: string;
  hash: string;
  message: string;
  why: string;
  when: string;
  words: number;
  isMain?: boolean;
};

function genHash(): string {
  return Math.random().toString(16).slice(2, 9);
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/* ================================================================== *
 * WhyModal — "What changed?" + "Why?" — draft/publish modes
 * ================================================================== */

function WhyModal({
  onSave,
  onClose,
  publishAsMain,
}: {
  onSave: (message: string, why: string) => void;
  onClose: () => void;
  publishAsMain?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [why, setWhy] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          {publishAsMain ? (
            <Check className="h-5 w-5 text-emerald-400" />
          ) : (
            <Save className="h-5 w-5 text-accent" />
          )}
          <h2 className="font-serif text-lg font-semibold">
            {publishAsMain ? "Publish to main" : "Save draft"}
          </h2>
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1.5 text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {publishAsMain && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-400">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Publishing marks this version as the <strong>main version</strong>{" "}
                of the chapter — the one readers and beta readers see. The
                previous main version becomes a regular draft.
              </span>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">
              {publishAsMain ? "What's in this version" : "What changed"}
            </label>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Tightened the opening dialogue"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">
              Why <span className="text-[var(--text-3)]">(optional)</span>
            </label>
            <textarea
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="Why did you make this change? Future-you will thank you. E.g. 'The opening was too slow — wanted to get to the harbour faster.'"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-[var(--text-3)]">
              This becomes searchable later — your decision log.
            </p>
          </div>
          <div className="flex gap-2 border-t border-border pt-4">
            <button
              onClick={onClose}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(message || "Untitled draft", why)}
              className={cn(
                "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold text-white hover:opacity-90",
                publishAsMain ? "bg-emerald-600 hover:bg-emerald-500" : "bg-accent hover:bg-accent/90",
              )}
            >
              <Check className="h-4 w-4" /> {publishAsMain ? "Publish" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== *
 * DraftHistory — searchable list, Main badge, why in italic
 * ================================================================== */

function DraftHistory({
  drafts,
  search,
  onSearch,
  onDelete,
}: {
  drafts: SavedDraft[];
  search: string;
  onSearch: (s: string) => void;
  onDelete: (id: string) => void;
}) {
  const filtered = search.trim()
    ? drafts.filter(
        (d) =>
          d.message.toLowerCase().includes(search.toLowerCase()) ||
          d.why.toLowerCase().includes(search.toLowerCase()),
      )
    : drafts;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold">Draft history</span>
        <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-2)]">
          {drafts.length} {drafts.length === 1 ? "draft" : "drafts"}
        </span>
      </div>
      <div className="relative mb-3 w-full">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-3)]" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search why…"
          className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
        />
      </div>
      <div className="bh-scroll -mr-2 flex-1 space-y-1 overflow-y-auto pr-2">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-[var(--text-2)]">
            No drafts match &ldquo;{search}&rdquo;.
          </div>
        ) : (
          filtered.map((d, i) => (
            <div
              key={d.id}
              className={cn(
                "group rounded-md px-2 py-1.5 text-xs",
                d.isMain
                  ? "border border-emerald-500/40 bg-emerald-500/10"
                  : i === 0 && drafts[0]?.id === d.id
                    ? "border border-accent/40 bg-accent/10"
                    : "border border-transparent hover:bg-[var(--surface-2)]",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-accent">{d.hash}</span>
                {d.isMain && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                    <Check className="h-2.5 w-2.5" /> Main
                  </span>
                )}
                <span className="truncate flex-1 text-[var(--text-2)]">
                  {d.message}
                </span>
                <span className="text-[var(--text-3)]">{d.when}</span>
                <button
                  onClick={() => onDelete(d.id)}
                  title="Delete draft"
                  className="shrink-0 rounded p-0.5 text-[var(--text-3)] opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {d.why && (
                <div className="mt-0.5 pl-2 text-[11px] italic text-[var(--text-3)]">
                  &ldquo;{d.why}&rdquo;
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ================================================================== *
 * StubToast — appears when a new @mention is detected
 * ================================================================== */

function StubToast({
  name,
  onDismiss,
  onView,
}: {
  name: string;
  onDismiss: () => void;
  onView: () => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-start gap-3 rounded-lg border border-accent/40 bg-card p-3 shadow-xl">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium">
          Character stub created for @{name}
        </div>
        <p className="text-xs text-[var(--text-2)]">
          Added to the World Bible. Fill in details whenever you&apos;re ready.
        </p>
        <div className="mt-1.5 flex gap-2">
          <button
            onClick={onView}
            className="text-xs font-medium text-accent hover:underline"
          >
            View in Cast
          </button>
          <button
            onClick={onDismiss}
            className="text-xs text-[var(--text-2)] hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="rounded p-0.5 text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ================================================================== *
 * GlossarySuggesterToast — appears when an unknown capitalized word
 * is detected in the prose. Offers to add it as a glossary term.
 * Same dismissable pattern as StubToast.
 * ================================================================== */

function GlossarySuggesterToast({
  term,
  chapterId,
  onAdd,
  onDismiss,
}: {
  term: string;
  chapterId: string;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-start gap-3 rounded-lg border border-[var(--draft)]/40 bg-card p-3 shadow-xl">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--draft)]/15 text-[var(--draft)]">
        <BookText className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium">
          Add &ldquo;{term}&rdquo; to Glossary?
        </div>
        <p className="text-xs text-[var(--text-2)]">
          You marked this with <span className="font-mono">!{term}!</span>. First use auto-filled from this chapter.
        </p>
        <div className="mt-1.5 flex gap-2">
          <button
            onClick={onAdd}
            className="text-xs font-medium text-accent hover:underline"
          >
            Add to Glossary
          </button>
          <button
            onClick={onDismiss}
            className="text-xs text-[var(--text-2)] hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="rounded p-0.5 text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ================================================================== *
 * extractGlossaryCandidates — finds !term! in the prose.
 * The user types !royal roads! — the closing ! signals "done typing".
 * This solves the timing issue: the toast only fires when the term is
 * complete and closed. Returns the term without the ! markers.
 * ================================================================== */

function extractGlossaryCandidates(
  text: string,
  knownTerms: Set<string>,
): string[] {
  // Match !term! — letters + spaces between two ! markers (lazy match)
  const matches = text.match(/!([A-Za-z][A-Za-z ]{1,}?!)/g) ?? [];
  const candidates = new Set<string>();
  for (const m of matches) {
    // strip both ! markers: "!royal roads!" → "royal roads"
    let term = m.slice(1, -1).trim();
    if (!term) continue;
    if (knownTerms.has(term.toLowerCase())) continue;
    candidates.add(term);
  }
  return [...candidates];
}

function ChapterJumpPalette({
  chapters,
  onSelect,
  onClose,
}: {
  chapters: Chapter[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-32"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Jump to chapter">
          <Command.Input
            placeholder="Jump to chapter…"
            autoFocus
            className="h-11 w-full border-b border-border bg-transparent px-4 text-sm placeholder:text-[var(--text-3)] focus:outline-none"
          />
          <Command.List className="bh-scroll max-h-72 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-xs text-[var(--text-2)]">
              No chapters found.
            </Command.Empty>
            {chapters.map((ch) => (
              <Command.Item
                key={ch.id}
                value={`ch ${ch.number} ${ch.title}`}
                onSelect={() => onSelect(ch.id)}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-[var(--surface-2)] data-[selected=true]:text-foreground"
              >
                <span className="font-mono text-xs text-[var(--text-3)]">
                  Ch {ch.number}
                </span>
                <span className="flex-1 truncate">{ch.title}</span>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wide",
                    ch.status === "draft"
                      ? "text-[var(--draft)]"
                      : "text-[var(--text-3)]",
                  )}
                >
                  {ch.status}
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

/* ================================================================== *
 * TopBar
 * ================================================================== */

function TopBar({
  bookId,
  chapterNumber,
  chapterTitle,
  focusMode,
  readAloudState,
  onToggleReadAloud,
  onToggleTools,
  onTogglePreview,
  onToggleFocus,
  wordCount,
  onSaveDraft,
  onPublish,
}: {
  bookId: string;
  chapterNumber: number;
  chapterTitle: string;
  focusMode: boolean;
  readAloudState: { speaking: boolean; paused: boolean };
  onToggleReadAloud: () => void;
  onToggleTools: () => void;
  onTogglePreview: () => void;
  onToggleFocus: () => void;
  wordCount: number;
  onSaveDraft: () => void;
  onPublish: () => void;
}) {
  const { navigate } = useRouter();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <button
        onClick={() => navigate({ name: "chapters", bookId })}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      {!focusMode && (
        <div className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-[var(--text-2)]" />
          <span className="font-mono text-sm text-[var(--text-2)]">
            Ch {chapterNumber} — {chapterTitle}
          </span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {/* read aloud */}
        <button
          onClick={onToggleReadAloud}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
            readAloudState.speaking
              ? "border-accent bg-accent/15 text-accent"
              : "border-border text-[var(--text-2)] hover:bg-[var(--surface-2)]",
          )}
          title={
            readAloudState.speaking
              ? readAloudState.paused
                ? "Resume reading"
                : "Stop reading"
              : "Read aloud"
          }
        >
          {readAloudState.speaking && !readAloudState.paused ? (
            <>
              <Square className="h-3.5 w-3.5" /> Stop
            </>
          ) : readAloudState.speaking && readAloudState.paused ? (
            <>
              <Play className="h-3.5 w-3.5" /> Resume
            </>
          ) : (
            <>
              <Volume2 className="h-4 w-4" /> Read
            </>
          )}
        </button>

        {/* tools */}
        <button
          onClick={onToggleTools}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          title="Tools"
        >
          <Wrench className="h-4 w-4" />
        </button>
        {/* preview */}
        <button
          onClick={onTogglePreview}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          title="Preview (⌘P)"
        >
          <Eye className="h-4 w-4" />
        </button>
        {/* focus mode */}
        <button
          onClick={onToggleFocus}
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-md border",
            focusMode
              ? "border-accent bg-accent/15 text-accent"
              : "border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground",
          )}
          title="Focus mode (⌘.)"
        >
          <Maximize2 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-6 w-px bg-border" />

        {!focusMode && (
          <span className="text-sm text-[var(--text-2)] tabular-nums">
            {wordCount.toLocaleString()}w
          </span>
        )}

        <button
          onClick={onSaveDraft}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          <Save className="h-4 w-4" /> Save draft
        </button>
        <button
          onClick={onPublish}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500"
          title="Mark this version as the main version of the chapter"
        >
          <Check className="h-4 w-4" /> Publish
        </button>
      </div>
    </header>
  );
}

/* ================================================================== *
 * StatusStrip — bottom 32px quiet bar
 * ================================================================== */

function StatusStrip({
  wordCount,
  mentionCount,
  stateLabel,
  lastSavedAt,
  dimmed,
}: {
  wordCount: number;
  mentionCount: number;
  stateLabel: string | null;
  lastSavedAt: number | null;
  dimmed: boolean;
}) {
  const readMinutes = Math.max(1, Math.round(wordCount / 200));
  const savedAgo = (() => {
    if (!lastSavedAt) return "never";
    const sec = Math.floor((Date.now() - lastSavedAt) / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  })();

  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-4 border-t border-border bg-background px-4 text-xs text-[var(--text-3)] tabular-nums",
        dimmed && "opacity-25",
      )}
    >
      <span>{wordCount.toLocaleString()} words</span>
      <span className="text-border">·</span>
      <span>{readMinutes} min read</span>
      <span className="text-border">·</span>
      <span>{mentionCount} chars tracked</span>
      <span className="text-border">·</span>
      <span>State: {stateLabel ?? "No state"}</span>
      <span className="ml-auto inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        auto-saved {savedAgo}
      </span>
    </div>
  );
}

/* ================================================================== *
 * Main EditorPage
 * ================================================================== */

type RightTab = "lore" | "drafts" | "tools" | "ai";

export function EditorPage({
  bookId,
  chapterId,
}: {
  bookId: string;
  chapterId: string;
}) {
  const { navigate } = useRouter();

  /* ----- data from API via React Query hooks ----- */
  const { data: chaptersData } = useChapters(bookId);
  const { data: cardsData } = useCards(bookId);
  const { data: glossaryData } = useGlossaryTerms(bookId);
  const { data: statesData } = useStates(bookId);
  const updateChapter = useUpdateChapter();
  const createGlossaryTerm = useCreateGlossaryTerm();
  const createChapterMut = useCreateChapter();
  const createCardMut = useCreateCard();

  // chapters visible in the rail (main branch only)
  const railChapters = useMemo(
    () =>
      (chaptersData ?? [])
        .filter((c) => c.bookId === bookId)
        .sort((a, b) => a.number - b.number),
    [chaptersData, bookId],
  );

  const chapter = useMemo(
    () => chaptersData?.find((c) => c.id === chapterId),
    [chaptersData, chapterId],
  );

  /* ----- local text/title (synced from hook data when chapterId changes) ----- */
  const [text, setText] = useState<string>(() => chapter?.content ?? "");
  const [title, setTitle] = useState<string>(() => chapter?.title ?? "");
  const knownStubsRef = useRef<Set<string>>(
    new Set(extractMentions(chapter?.content ?? "").map((n) => n.toLowerCase())),
  );

  // Reset-on-prop-change: when chapterId changes, reload text/title
  const [lastChapterId, setLastChapterId] = useState(chapterId);
  if (chapterId !== lastChapterId) {
    setLastChapterId(chapterId);
    const ch = chaptersData?.find((c) => c.id === chapterId);
    setText(ch?.content ?? "");
    setTitle(ch?.title ?? "");
  }

  // Update known stubs when chapterId changes (ref must be in effect, not render)
  useEffect(() => {
    const ch = chaptersData?.find((c) => c.id === chapterId);
    knownStubsRef.current = new Set(
      extractMentions(ch?.content ?? "").map((n) => n.toLowerCase()),
    );
  }, [chapterId, chaptersData]);

  /* ----- auto-save (in event handlers, not effects) ----- */
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // periodic refresh of the "auto-saved Nm ago" display
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 30_000);
    return () => clearInterval(id);
  }, []);

  const commitChapterToStore = useCallback(
    (newText: string, newTitle: string) => {
      updateChapter.mutate({
        id: chapterId,
        updates: {
          content: newText,
          title: newTitle,
        },
      });
      setLastSavedAt(Date.now());
    },
    [chapterId, updateChapter],
  );

  /* ----- why modal ----- */
  const [showWhy, setShowWhy] = useState(false);
  const [publishMode, setPublishMode] = useState(false);

  /* ----- drafts (real, API-backed) ----- */
  const { data: draftsData } = useDrafts(chapterId);
  const createDraft = useCreateDraft();
  const deleteDraftMut = useDeleteDraft();
  const [draftSearch, setDraftSearch] = useState("");
  const drafts: SavedDraft[] = useMemo(
    () =>
      (draftsData ?? []).map((d) => ({
        id: d.id,
        hash: d.hash ?? "",
        message: d.message,
        why: d.why ?? "",
        when: formatRelativeTime(d.createdAt),
        words: d.wordCount,
        isMain: d.isMain,
      })),
    [draftsData],
  );
  const hasMain = drafts.some((d) => d.isMain);

  /* ----- stub toast ----- */
  const [stubToast, setStubToast] = useState<string | null>(null);

  /* ----- glossary suggester ----- */
  const [glossarySuggestion, setGlossarySuggestion] = useState<string | null>(null);
  // track known/dismissed glossary terms so we don't re-suggest
  const knownGlossaryRef = useRef<Set<string>>(
    new Set(
      (glossaryData ?? [])
        .filter((g) => g.bookId === bookId)
        .map((g) => g.term.toLowerCase()),
    ),
  );
  // character names from the API (for excluding from glossary suggestions)
  const characterNamesRef = useRef<Set<string>>(
    new Set(
      (cardsData ?? [])
        .filter((c) => c.bookId === bookId && c.category === "character")
        .flatMap((c) => [c.title, ...c.title.split(/\s+/)])
        .map((n) => n.toLowerCase())
        .filter((n) => n.length > 1),
    ),
  );

  const handleTextChange = (newText: string) => {
    setText(newText);
    // detect new @mentions, fire one toast at a time
    const names = extractMentions(newText);
    const known = knownStubsRef.current;
    for (const name of names) {
      const key = name.toLowerCase();
      if (!known.has(key)) {
        known.add(key);
        setStubToast(name);
        break;
      }
    }
    // detect glossary candidates (!terms the user explicitly marked)
    if (!glossarySuggestion) {
      const candidates = extractGlossaryCandidates(
        newText,
        knownGlossaryRef.current,
      );
      for (const candidate of candidates) {
        if (!knownGlossaryRef.current.has(candidate.toLowerCase())) {
          knownGlossaryRef.current.add(candidate.toLowerCase());
          setGlossarySuggestion(candidate);
          break;
        }
      }
    }
    // debounced save to store + localStorage (in event handler — OK)
    commitChapterToStore(newText, title);
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    commitChapterToStore(text, newTitle);
  };

  const handleSave = (message: string, why: string) => {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    createDraft.mutate({
      chapterId,
      input: {
        content: text,
        message,
        why: why || null,
        hash: genHash(),
        isMain: publishMode,
        wordCount: words,
      },
    });
    setShowWhy(false);
    setPublishMode(false);
  };

  const handleDeleteDraft = (draftId: string) => {
    if (!window.confirm("Delete this draft? This can't be undone.")) return;
    deleteDraftMut.mutate(draftId);
  };

  /* ----- read aloud ----- */
  const readAloud = useReadAloud();
  const [rate, setRate] = useState(0.95);
  useEffect(() => {
    readAloud.setRate(rate);
  }, [rate, readAloud]);

  const handleReadAloudToggle = () => {
    if (readAloud.speaking && !readAloud.paused) {
      readAloud.stop();
    } else if (readAloud.speaking && readAloud.paused) {
      readAloud.resume();
    } else {
      readAloud.speak(text);
    }
  };

  /* ----- rail / panel collapse (persisted) ----- */
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("bh-editor-rail") === "1";
  });
  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("bh-editor-panel") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("bh-editor-rail", railCollapsed ? "1" : "0");
  }, [railCollapsed]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("bh-editor-panel", panelCollapsed ? "1" : "0");
  }, [panelCollapsed]);

  /* ----- right panel tab ----- */
  const [activeTab, setActiveTab] = useState<RightTab>("lore");

  /* ----- AI session memory: per-chapter, clears on chapter switch ----- */
  const [aiMessages, setAiMessagesState] = useState<ChatMessage[]>([]);
  const [aiContinuePreview, setAiContinuePreviewState] = useState<ContinuePreview | null>(null);

  // Clear AI chat when chapterId changes — each chapter starts fresh
  const [lastChapterIdForAI, setLastChapterIdForAI] = useState(chapterId);
  if (chapterId !== lastChapterIdForAI) {
    setLastChapterIdForAI(chapterId);
    setAiMessagesState([]);
    setAiContinuePreviewState(null);
  }

  function setAiMessages(updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) {
    setAiMessagesState(updater);
  }
  function setAiContinuePreview(preview: ContinuePreview | null) {
    setAiContinuePreviewState(preview);
  }

  /* ----- palette / focus / preview ----- */
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  /* ----- lore tab: pinned cards ----- */
  const [pinnedCardIds, setPinnedCardIds] = useState<string[]>([]);
  const [loreSearch, setLoreSearch] = useState("");

  /* ----- new chapter ----- */
  const handleNewChapter = () => {
    const newId = `ch-${Date.now()}`;
    const nextNumber = railChapters.length + 1;
    const newCh: Chapter = {
      id: newId,
      bookId,
      number: nextNumber,
      title: "Untitled chapter",
      words: 0,
      status: "draft",
      branchId: "main",
      updated: "just now",
      content: "",
    };
    createChapterMut.mutate({
      bookId,
      input: {
        title: `Chapter ${railChapters.length + 1}`,
        sortOrder: railChapters.length,
        status: "draft",
        content: "",
      },
    });
    navigate({ name: "editor", bookId, chapterId: newId });
  };

  /* ----- derived data for lore tab + status strip ----- */
  const allCards: LoreCard[] = useMemo(() => cardsData ?? [], [cardsData]);
  const mentions = useMemo(() => extractMentions(text), [text]);
  const mentionCards = useMemo(() => {
    return mentions
      .map((name) => findCharCardByName(allCards, bookId, name))
      .filter((c): c is LoreCard => Boolean(c));
  }, [mentions, allCards, bookId]);

  const states = useMemo(() => statesData ?? [], [statesData]);
  const currentState = useMemo(
    () => states.find((s) => s.chapterId === chapterId) ?? null,
    [states, chapterId],
  );

  // "state after Ch N-1" — find the previous main-branch chapter, then its state
  const prevState = useMemo(() => {
    if (!chapter) return null;
    const prevChapter = railChapters.find((c) => c.number === chapter.number - 1);
    if (!prevChapter) return null;
    return states.find((s) => s.chapterId === prevChapter.id) ?? null;
  }, [chapter, railChapters, states]);

  const pinnedCards = useMemo(
    () => pinnedCardIds.map((id) => allCards.find((c) => c.id === id)).filter((c): c is LoreCard => Boolean(c)),
    [pinnedCardIds, allCards],
  );

  const loreSearchResults = useMemo(() => {
    if (!loreSearch.trim()) return [];
    const q = loreSearch.toLowerCase();
    return allCards
      .filter((c) => c.bookId === bookId)
      .filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [loreSearch, allCards, bookId]);

  /* ----- keyboard shortcuts ----- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod && e.key !== "Escape") return;

      const active = document.activeElement;
      const tag = active?.tagName.toLowerCase();
      const inField =
        tag === "input" ||
        tag === "textarea" ||
        (active as HTMLElement | null)?.isContentEditable;

      // ESC — exit preview OR focus (whichever is active)
      if (e.key === "Escape" && !mod) {
        if (previewMode) {
          e.preventDefault();
          setPreviewMode(false);
          return;
        }
        if (focusMode) {
          e.preventDefault();
          setFocusMode(false);
          return;
        }
        if (paletteOpen) {
          e.preventDefault();
          setPaletteOpen(false);
          return;
        }
        if (showWhy) {
          e.preventDefault();
          setShowWhy(false);
          setPublishMode(false);
          return;
        }
        return;
      }

      if (!mod) return;

      // ⌘S — save draft (works even in textarea)
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        setPublishMode(false);
        setShowWhy(true);
        return;
      }
      // ⌘⏎ — publish (works even in textarea)
      if (e.key === "Enter") {
        e.preventDefault();
        setPublishMode(true);
        setShowWhy(true);
        return;
      }

      // remaining shortcuts: skip when typing in an input/textarea
      if (inField) return;

      // ⌘K — palette
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      // ⌘N — new chapter
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewChapter();
        return;
      }
      // ⌘. — focus mode
      if (e.key === ".") {
        e.preventDefault();
        setFocusMode((o) => !o);
        return;
      }
      // ⌘⇧R — read aloud
      if (e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleReadAloudToggle();
        return;
      }
      // ⌘P — preview
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPreviewMode((o) => !o);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewMode, focusMode, paletteOpen, showWhy, text, readAloud, handleNewChapter]);

  /* ----- helpers ----- */
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleToggleTools = () => {
    setActiveTab("tools");
    if (panelCollapsed) setPanelCollapsed(false);
  };

  const handleStubView = () => {
    if (!stubToast) return;
    // Remove the @ prefix from the text (e.g. "@Cassandra" → "Cassandra")
    const cleaned = text.replace(`@${stubToast}`, stubToast);
    if (cleaned !== text) {
      setText(cleaned);
      commitChapterToStore(cleaned, title);
    }
    // Create the character card in the DB, then navigate to Cast
    createCardMut.mutate(
      {
        bookId,
        input: {
          category: "character" as const,
          title: stubToast,
          x: 200,
          y: 100,
        },
      },
      {
        onSuccess: (card) => {
          setStubToast(null);
          navigate({ name: "cast", bookId, focusCardId: card.id });
        },
      },
    );
  };

  /* ----- glossary suggester: add the term to the store ----- */
  const handleAddGlossaryTerm = () => {
    if (!glossarySuggestion) return;
    createGlossaryTerm.mutate({
      bookId,
      input: {
        term: glossarySuggestion,
        definition: "",
        firstUseChapterId: chapterId,
      },
    });
    // Remove both ! markers from the text (e.g. "!royal roads!" → "royal roads")
    const cleaned = text.replace(`!${glossarySuggestion}!`, glossarySuggestion);
    if (cleaned !== text) {
      setText(cleaned);
      commitChapterToStore(cleaned, title);
    }
    setGlossarySuggestion(null);
  };

  /* ================================================================== *
   * PREVIEW MODE — reader layout
   * ================================================================== */
  if (previewMode) {
    return (
      <div className="relative h-screen overflow-y-auto bg-background text-foreground">
        <article className="mx-auto max-w-[36rem] px-8 py-16">
          <h1 className="mb-8 text-center font-serif text-3xl font-semibold tracking-tight">
            {title || "Untitled"}
          </h1>
          <div className="font-serif text-[18px] leading-[1.8] text-zinc-200 whitespace-pre-wrap text-justify">
            {text}
          </div>
        </article>
        {/* floating read-aloud pill */}
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-xl">
          <button
            onClick={handleReadAloudToggle}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium",
              readAloud.speaking
                ? "bg-accent/15 text-accent"
                : "text-[var(--text-2)] hover:bg-[var(--surface-2)]",
            )}
          >
            {readAloud.speaking && !readAloud.paused ? (
              <>
                <Square className="h-3 w-3" /> Stop
              </>
            ) : readAloud.speaking && readAloud.paused ? (
              <>
                <Play className="h-3 w-3" /> Resume
              </>
            ) : (
              <>
                <Play className="h-3 w-3" /> Play
              </>
            )}
          </button>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-3)]">
            <span>Rate</span>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="h-1 w-20 accent-[var(--accent)]"
            />
            <span className="tabular-nums">{rate.toFixed(2)}×</span>
          </div>
          <button
            onClick={() => setPreviewMode(false)}
            className="text-xs text-[var(--text-2)] hover:text-foreground"
            title="Exit preview (ESC)"
          >
            ESC
          </button>
        </div>
      </div>
    );
  }

  /* ================================================================== *
   * NORMAL / FOCUS MODE
   * ================================================================== */
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar
        bookId={bookId}
        chapterNumber={chapter?.number ?? 0}
        chapterTitle={title || chapter?.title || "Untitled"}
        focusMode={focusMode}
        readAloudState={{
          speaking: readAloud.speaking,
          paused: readAloud.paused,
        }}
        onToggleReadAloud={handleReadAloudToggle}
        onToggleTools={handleToggleTools}
        onTogglePreview={() => setPreviewMode(true)}
        onToggleFocus={() => setFocusMode((o) => !o)}
        wordCount={wordCount}
        onSaveDraft={() => {
          setPublishMode(false);
          setShowWhy(true);
        }}
        onPublish={() => {
          setPublishMode(true);
          setShowWhy(true);
        }}
      />

      <div className="flex min-h-0 flex-1">
        {/* ============== LEFT RAIL ============== */}
        {!focusMode && (
          <aside
            className={cn(
              "flex shrink-0 flex-col border-r border-border bg-background",
              railCollapsed ? "w-11" : "w-60",
            )}
          >
            {/* rail header */}
            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
              {!railCollapsed && (
                <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                  Chapters
                </span>
              )}
              <button
                onClick={() => setPaletteOpen(true)}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
                title="Jump to chapter (⌘K)"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setRailCollapsed((o) => !o)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
                title={railCollapsed ? "Expand rail" : "Collapse rail"}
              >
                {railCollapsed ? (
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                ) : (
                  <PanelLeftClose className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* chapter list */}
            <div className="bh-scroll flex-1 overflow-y-auto py-1">
              {railChapters.map((ch) => {
                const active = ch.id === chapterId;
                return (
                  <button
                    key={ch.id}
                    onClick={() =>
                      navigate({ name: "editor", bookId, chapterId: ch.id })
                    }
                    className={cn(
                      "group relative flex w-full items-center gap-2.5 px-3 py-2 text-left",
                      railCollapsed && "justify-center px-0",
                      "hover:bg-[var(--surface-2)]",
                    )}
                    title={railCollapsed ? `Ch ${ch.number} — ${ch.title}` : undefined}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 bg-accent" />
                    )}
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border font-mono text-[11px]",
                        active
                          ? "border-accent bg-accent/15 text-accent"
                          : "text-[var(--text-3)]",
                      )}
                    >
                      {ch.number}
                    </span>
                    {!railCollapsed && (
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm",
                            ch.status === "draft"
                              ? "text-[var(--text-3)]"
                              : "text-foreground",
                          )}
                        >
                          {ch.title}
                        </span>
                        {ch.status === "draft" && (
                          <span className="text-[10px] uppercase tracking-wide text-[var(--draft)]">
                            draft
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* new chapter button */}
            <div className="shrink-0 border-t border-border p-2">
              <button
                onClick={handleNewChapter}
                className={cn(
                  "inline-flex h-8 w-full items-center gap-2 rounded-md border border-dashed border-border text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground",
                  railCollapsed && "justify-center",
                )}
                title="New chapter"
              >
                <Plus className="h-3.5 w-3.5" />
                {!railCollapsed && <span>New chapter</span>}
              </button>
            </div>
          </aside>
        )}

        {/* ============== CENTER (prose) ============== */}
        <main className="bh-scroll relative min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[40rem] px-6 py-10">
            <input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Untitled chapter"
              className="mb-6 w-full bg-transparent font-serif text-3xl font-semibold tracking-tight text-foreground placeholder:text-[var(--text-3)] focus:outline-none"
              aria-label="Chapter title"
            />
            <textarea
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              spellCheck
              aria-label="Chapter editor"
              placeholder="Double-click or start typing…"
              className="min-h-[60vh] w-full resize-none rounded-lg border border-border bg-card p-6 font-serif text-[18px] leading-[1.8] text-zinc-200 placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
            />
            <p className="mt-4 text-center text-xs text-[var(--text-3)]">
              Every save is a draft you can roll back to. Type
              <span className="font-mono"> @Name</span> to auto-track characters.
            </p>
          </div>
        </main>

        {/* ============== RIGHT PANEL ============== */}
        {!focusMode && !panelCollapsed && (
          <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-background">
            {/* tabs */}
            <div className="flex h-10 shrink-0 items-center border-b border-border px-2">
              {(["lore", "drafts", "tools", "ai"] as RightTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={cn(
                    "relative h-full px-3 text-xs font-medium capitalize",
                    activeTab === t
                      ? "text-accent"
                      : "text-[var(--text-2)] hover:text-foreground",
                  )}
                >
                  {t}
                  {activeTab === t && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 bg-accent" />
                  )}
                </button>
              ))}
              <button
                onClick={() => setPanelCollapsed(true)}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
                title="Hide panel"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* tab body */}
            <div className="bh-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {/* ----- LORE TAB ----- */}
              {activeTab === "lore" && (
                <div className="space-y-4">
                  {/* pinned cards */}
                  {pinnedCards.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                        Pinned
                      </span>
                      {pinnedCards.map((c) => (
                        <LoreCardBlock
                          key={c.id}
                          card={c}
                          onJump={() =>
                            navigate({
                              name: "cast",
                              bookId,
                              focusCardId: c.id,
                            })
                          }
                          onUnpin={() =>
                            setPinnedCardIds((prev) =>
                              prev.filter((id) => id !== c.id),
                            )
                          }
                        />
                      ))}
                    </div>
                  )}

                  {/* auto-cards from @mentions */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                      Mentioned in this chapter
                    </span>
                    {mentionCards.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-[var(--text-3)]">
                        Type <span className="font-mono">@CharacterName</span> in
                        the prose to surface their lore card here.
                      </p>
                    ) : (
                      mentionCards.map((c) => (
                        <LoreCardBlock
                          key={c.id}
                          card={c}
                          onJump={() =>
                            navigate({
                              name: "cast",
                              bookId,
                              focusCardId: c.id,
                            })
                          }
                        />
                      ))
                    )}
                  </div>

                  {/* state after Ch N-1 */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                      State after Ch {(chapter?.number ?? 1) - 1 || 0}
                    </span>
                    {prevState ? (
                      <div className="rounded-md border border-border bg-card p-3 text-xs">
                        <div className="font-medium text-foreground">
                          {prevState.label}
                        </div>
                        <div className="mt-1 text-[var(--text-2)]">
                          <span className="text-[var(--text-3)]">Location:</span>{" "}
                          {prevState.location}
                        </div>
                        <div className="mt-1 text-[var(--text-2)]">
                          <span className="text-[var(--text-3)]">Present:</span>{" "}
                          {prevState.present.join(", ") || "—"}
                        </div>
                        {prevState.activeThreads.length > 0 && (
                          <div className="mt-1 text-[var(--text-2)]">
                            <span className="text-[var(--text-3)]">
                              Threads:
                            </span>{" "}
                            {prevState.activeThreads.join(" · ")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-[var(--text-3)]">
                        No state recorded for the previous chapter.
                      </p>
                    )}
                  </div>

                  {/* search to pin any bible card */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                      Pin a Bible card
                    </span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-3)]" />
                      <input
                        value={loreSearch}
                        onChange={(e) => setLoreSearch(e.target.value)}
                        placeholder="Search any card…"
                        className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
                      />
                    </div>
                    {loreSearchResults.length > 0 && (
                      <div className="space-y-1">
                        {loreSearchResults.map((c) => {
                          const pinned = pinnedCardIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              onClick={() => {
                                if (pinned) return;
                                setPinnedCardIds((prev) => [...prev, c.id]);
                                setLoreSearch("");
                              }}
                              disabled={pinned}
                              className={cn(
                                "flex w-full items-start gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-left text-xs hover:bg-[var(--surface-2)]",
                                pinned && "opacity-50",
                              )}
                            >
                              <Pin className="mt-0.5 h-3 w-3 shrink-0 text-[var(--text-3)]" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-foreground">
                                  {c.title}
                                </span>
                                <span className="block truncate text-[var(--text-3)]">
                                  {c.category}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ----- DRAFTS TAB ----- */}
              {activeTab === "drafts" && (
                <div className="flex h-full flex-col">
                  <DraftHistory
                    drafts={drafts}
                    search={draftSearch}
                    onSearch={setDraftSearch}
                    onDelete={handleDeleteDraft}
                  />
                  <div className="mt-4 flex shrink-0 gap-2 border-t border-border pt-3">
                    <button
                      onClick={() => {
                        setPublishMode(false);
                        setShowWhy(true);
                      }}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border text-sm font-medium hover:bg-[var(--surface-2)]"
                    >
                      <Save className="h-4 w-4" /> Save draft
                    </button>
                    <button
                      onClick={() => {
                        setPublishMode(true);
                        setShowWhy(true);
                      }}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500"
                    >
                      <Check className="h-4 w-4" /> Publish
                    </button>
                  </div>
                  {hasMain && (
                    <p className="mt-2 shrink-0 text-center text-[10px] text-[var(--text-3)]">
                      A main version is marked. Publishing replaces it.
                    </p>
                  )}
                </div>
              )}

              {/* ----- TOOLS TAB ----- */}
              {activeTab === "tools" && (
                <div className="space-y-4">
                  {/* crutch word panel — uses the imported CrutchWordPanel.
                   * The component is built as an absolute-positioned popover
                   * (right-0 top-12 w-80), so we override those classes via
                   * arbitrary variants on the wrapper to render it inline. */}
                  <div
                    className={cn(
                      "overflow-hidden rounded-lg border border-border bg-card",
                      "[&>div]:!static [&>div]:!right-auto [&>div]:!top-auto",
                      "[&>div]:!w-full [&>div]:!shadow-none [&>div]:!rounded-none",
                      "[&>div]:!border-0 [&>div]:!bg-transparent",
                    )}
                  >
                    <CrutchWordPanel
                      text={text}
                      onClose={() => setActiveTab("lore")}
                    />
                  </div>

                  {/* read aloud controls */}
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-accent" />
                      <span className="text-xs font-semibold">Read aloud</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleReadAloudToggle}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium",
                          readAloud.speaking
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border text-[var(--text-2)] hover:bg-[var(--surface-2)]",
                        )}
                      >
                        {readAloud.speaking && !readAloud.paused ? (
                          <>
                            <Square className="h-3 w-3" /> Stop
                          </>
                        ) : readAloud.speaking && readAloud.paused ? (
                          <>
                            <Play className="h-3 w-3" /> Resume
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3" /> Play
                          </>
                        )}
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--text-3)]">
                      <span>Rate</span>
                      <input
                        type="range"
                        min={0.5}
                        max={1.5}
                        step={0.05}
                        value={rate}
                        onChange={(e) => setRate(parseFloat(e.target.value))}
                        className="h-1 flex-1 accent-[var(--accent)]"
                      />
                      <span className="tabular-nums">{rate.toFixed(2)}×</span>
                    </div>
                  </div>

                  {/* word count stats */}
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-accent" />
                      <span className="text-xs font-semibold">Word count</span>
                    </div>
                    <dl className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-[var(--text-2)]">Total words</dt>
                        <dd className="tabular-nums text-foreground">
                          {wordCount.toLocaleString()}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-[var(--text-2)]">
                          Reading time (200wpm)
                        </dt>
                        <dd className="tabular-nums text-foreground">
                          {Math.max(1, Math.round(wordCount / 200))} min
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-[var(--text-2)]">Characters</dt>
                        <dd className="tabular-nums text-foreground">
                          {text.length.toLocaleString()}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-[var(--text-2)]">@mentions</dt>
                        <dd className="tabular-nums text-foreground">
                          {mentions.length}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}

              {/* ----- AI TAB ----- */}
              {activeTab === "ai" && (
                <AiChatPanel
                  bookId={bookId}
                  chapterId={chapterId}
                  chapterNumber={chapter?.number ?? 0}
                  chapterTitle={title || chapter?.title || "Untitled"}
                  mentionCount={mentions.length}
                  stateCount={states.length}
                  onInsertText={(insertedText: string) => {
                    const newText = text + (text.endsWith("\n") ? "" : "\n\n") + insertedText;
                    setText(newText);
                    commitChapterToStore(newText, title);
                  }}
                  messages={aiMessages}
                  setMessages={setAiMessages}
                  continuePreview={aiContinuePreview}
                  setContinuePreview={setAiContinuePreview}
                />
              )}
            </div>
          </aside>
        )}

        {/* ============== PANEL COLLAPSED — show reopen button ============== */}
        {!focusMode && panelCollapsed && (
          <button
            onClick={() => setPanelCollapsed(false)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-l-md border border-r-0 border-border bg-background text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
            title="Show panel"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <StatusStrip
        wordCount={wordCount}
        mentionCount={mentions.length}
        stateLabel={currentState?.label ?? null}
        lastSavedAt={lastSavedAt}
        dimmed={focusMode}
      />

      {/* ============== OVERLAYS ============== */}
      {showWhy && (
        <WhyModal
          onSave={handleSave}
          onClose={() => {
            setShowWhy(false);
            setPublishMode(false);
          }}
          publishAsMain={publishMode}
        />
      )}

      {stubToast && (
        <StubToast
          name={stubToast}
          onDismiss={() => setStubToast(null)}
          onView={handleStubView}
        />
      )}

      {glossarySuggestion && (
        <GlossarySuggesterToast
          term={glossarySuggestion}
          chapterId={chapterId}
          onAdd={handleAddGlossaryTerm}
          onDismiss={() => setGlossarySuggestion(null)}
        />
      )}

      {paletteOpen && (
        <ChapterJumpPalette
          chapters={railChapters}
          onSelect={(id) => {
            setPaletteOpen(false);
            navigate({ name: "editor", bookId, chapterId: id });
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}

/* ================================================================== *
 * LoreCardBlock — shared card preview used in Lore tab
 * ================================================================== */

function LoreCardBlock({
  card,
  onJump,
  onUnpin,
}: {
  card: LoreCard;
  onJump: () => void;
  onUnpin?: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {card.title}
            </span>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide",
                card.status === "canon"
                  ? "text-accent"
                  : card.status === "draft"
                    ? "text-[var(--draft)]"
                    : "text-[var(--text-3)]",
              )}
            >
              {card.status}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--text-2)]">
            {card.summary}
          </p>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-end gap-2">
        <button
          onClick={onJump}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
        >
          Open in Cast <ArrowUpRight className="h-3 w-3" />
        </button>
        {onUnpin && (
          <button
            onClick={onUnpin}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-3)] hover:text-foreground"
          >
            <X className="h-3 w-3" /> Unpin
          </button>
        )}
      </div>
    </div>
  );
}


