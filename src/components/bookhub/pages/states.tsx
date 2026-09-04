"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  Plus,
  GitCompare,
  MapPin,
  Users,
  BookOpen,
  Package,
  ListTree,
  StickyNote,
  Save,
} from "lucide-react";
import { useStates, useChapters, LoadingSpinner } from "@/lib/hooks";
import type { ChapterState } from "@/lib/data-client";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * StatesPage — chapter state manager.
 *
 * Vertical list of chapter states. Each is a card; collapsed shows
 * label + chapter name + location. Expanded shows all structured
 * fields in a clean key-value layout.
 * ------------------------------------------------------------------ */

function StateRow({ state, chapterTitle }: { state: ChapterState; chapterTitle?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)]"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--text-3)] transition-transform",
            open && "rotate-90",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-foreground">
              {state.label}
            </span>
            {chapterTitle && (
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-[var(--text-2)]">
                {chapterTitle}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{state.location}</span>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4">
          {/* location */}
          <Field icon={MapPin} label="Location" value={state.location} mono={false} />

          {/* present */}
          <FieldList icon={Users} label="Present" items={state.present} />

          {/* knowledge */}
          {state.knowledge.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-[var(--text-3)]" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
                  Knowledge
                </span>
              </div>
              <ul className="space-y-1.5">
                {state.knowledge.map((k, i) => (
                  <li
                    key={`${k.who}-${i}`}
                    className="grid grid-cols-[120px_1fr] gap-2 text-[12px]"
                  >
                    <span className="font-medium text-[var(--text-2)]">
                      {k.who}
                    </span>
                    <span className="leading-relaxed text-foreground">
                      {k.knows}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* items */}
          <FieldList icon={Package} label="Items" items={state.items} />

          {/* active threads */}
          <FieldList icon={ListTree} label="Active threads" items={state.activeThreads} />

          {/* notes */}
          {state.notes && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2">
                <StickyNote className="h-3.5 w-3.5 text-[var(--text-3)]" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
                  Notes
                </span>
              </div>
              <p className="rounded-md bg-background px-3 py-2 text-[12px] leading-relaxed text-[var(--text-2)]">
                {state.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-[var(--text-3)]" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "pl-5 text-[12px] leading-relaxed text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FieldList({
  icon: Icon,
  label,
  items,
}: {
  icon: typeof MapPin;
  label: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-[var(--text-3)]" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
          {label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-5">
        {items.map((it, i) => (
          <span
            key={`${it}-${i}`}
            className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-[var(--text-2)]"
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */
export function StatesPage({ bookId }: { bookId: string }) {
  const { data: statesData, isLoading } = useStates(bookId);
  const { data: chaptersData } = useChapters(bookId);
  const states = statesData ?? [];
  const chapters = chaptersData ?? [];
  if (isLoading) return <LoadingSpinner />;

  function chapterTitle(chapterId: string): string | undefined {
    const ch = chapters.find((c) => c.id === chapterId);
    return ch ? `Ch.${ch.number} · ${ch.title}` : undefined;
  }

  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-8">
      {/* header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
            <Save className="h-3 w-3" />
            States
          </div>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            Chapter state manager
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-2)]">
            Track who's where, who knows what, and which threads are still
            open at the end of each chapter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground transition-colors"
            title="Compare two states — placeholder"
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Diff</span>
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors">
            <Plus className="h-3.5 w-3.5" />
            New state
          </button>
        </div>
      </div>

      {/* list */}
      {states.length > 0 ? (
        <div className="space-y-3">
          {states.map((s) => (
            <StateRow
              key={s.id}
              state={s}
              chapterTitle={chapterTitle(s.chapterId)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Save className="mx-auto h-6 w-6 text-[var(--text-3)]" />
          <p className="mt-2 text-[13px] text-[var(--text-2)]">No states yet.</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
            Capture the state of your world at the end of a chapter.
          </p>
        </div>
      )}

      {/* diff placeholder note */}
      <p className="mt-6 text-center text-[11px] text-[var(--text-3)]">
        Compare two states — placeholder. Diff view coming soon.
      </p>
    </div>
  );
}
