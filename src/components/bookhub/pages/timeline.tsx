"use client";

import { useMemo } from "react";
import {
  CalendarClock,
  FileText,
  Save,
  ArrowUpRight,
  CircleDot,
} from "lucide-react";
import { useEvents, useChapters, useStates, LoadingSpinner } from "@/lib/hooks";
import type { StoryEvent } from "@/lib/data-client";
import { useRouter } from "../router";

/* ------------------------------------------------------------------ *
 * TimelinePage — story chronology.
 *
 * Vertical list of narrative events in order. A left vertical line,
 * each event is a dot on the line with a content card to the right.
 * Each card links to its chapter (editor) and state (states page).
 * ------------------------------------------------------------------ */

function EventNode({
  event,
  chapterTitle,
  stateLabel,
  isLast,
  onOpenChapter,
  onOpenState,
}: {
  event: StoryEvent;
  chapterTitle?: string;
  stateLabel?: string;
  isLast: boolean;
  onOpenChapter: () => void;
  onOpenState: () => void;
}) {
  return (
    <li className="relative pl-8">
      {/* dot — straddles the vertical border on the <ol> */}
      <span
        className="absolute -left-[9px] top-4 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background"
        aria-hidden
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      </span>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className="text-[14px] font-semibold text-foreground">
            {event.order}. {event.title}
          </h3>
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-3)]">
            <CalendarClock className="h-3 w-3" />
            {event.timestamp}
          </span>
        </div>

        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-2)]">
          {event.summary}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-2.5">
          {chapterTitle && (
            <button
              onClick={onOpenChapter}
              className="group inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-2)] transition-colors hover:text-accent"
            >
              <FileText className="h-3 w-3 text-[var(--text-3)] group-hover:text-accent" />
              <span className="font-mono">{chapterTitle}</span>
              <ArrowUpRight className="h-3 w-3 text-[var(--text-3)] transition-colors group-hover:text-accent" />
            </button>
          )}
          {stateLabel && (
            <button
              onClick={onOpenState}
              className="group inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-2)] transition-colors hover:text-accent"
            >
              <Save className="h-3 w-3 text-[var(--text-3)] group-hover:text-accent" />
              <span>{stateLabel}</span>
              <ArrowUpRight className="h-3 w-3 text-[var(--text-3)] transition-colors group-hover:text-accent" />
            </button>
          )}
        </div>
      </div>

      {/* hide the trailing vertical line on the last node */}
      {isLast && <span className="hidden" />}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */
export function TimelinePage({ bookId }: { bookId: string }) {
  const { navigate } = useRouter();
  const { data: eventsData, isLoading } = useEvents(bookId);
  const { data: chaptersData } = useChapters(bookId);
  const { data: statesData } = useStates(bookId);
  const events = eventsData ?? [];
  const chapters = chaptersData ?? [];
  const states = statesData ?? [];
  if (isLoading) return <LoadingSpinner />;

  function chapterTitle(chapterId: string): string | undefined {
    const ch = chapters.find((c) => c.id === chapterId);
    return ch ? `Ch.${ch.number} · ${ch.title}` : undefined;
  }

  function stateLabel(stateId: string): string | undefined {
    return states.find((s) => s.id === stateId)?.label;
  }

  return (
    <div className="mx-auto max-w-2xl p-6 sm:p-8">
      {/* header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
          <CircleDot className="h-3 w-3" />
          Timeline
        </div>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          Story chronology
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-2)]">
          Narrative events in order. Each links to the chapter it happens in
          and the state of the world afterward.
        </p>
      </div>

      {/* timeline */}
      {events.length > 0 ? (
        <ol className="relative ml-[7px] space-y-4 border-l-2 border-border pt-2">
          {events.map((ev, i) => (
            <EventNode
              key={ev.id}
              event={ev}
              chapterTitle={chapterTitle(ev.chapterId)}
              stateLabel={stateLabel(ev.stateId)}
              isLast={i === events.length - 1}
              onOpenChapter={() =>
                navigate({ name: "editor", bookId, chapterId: ev.chapterId })
              }
              onOpenState={() => navigate({ name: "states", bookId })}
            />
          ))}
        </ol>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <CalendarClock className="mx-auto h-6 w-6 text-[var(--text-3)]" />
          <p className="mt-2 text-[13px] text-[var(--text-2)]">No events yet.</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
            Story events appear here once you've added them.
          </p>
        </div>
      )}
    </div>
  );
}
