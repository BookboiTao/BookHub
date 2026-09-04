"use client";

import { useMemo } from "react";
import { BookOpen, FileText, GitBranch, Clock, ArrowRight, PenLine, Trash2 } from "lucide-react";
import { useBook, useChapters, useBranches, useDeleteBook, LoadingSpinner } from "@/lib/hooks";
import { useRouter } from "../router";
import { cn } from "@/lib/utils";
import type { Chapter } from "@/lib/data-client";

/* ------------------------------------------------------------------ *
 * Book Home — book overview / landing page.
 * Hero + stat cards + recent activity.
 * ------------------------------------------------------------------ */

function formatWords(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function StatusBadge({ status }: { status: Chapter["status"] }) {
  const label =
    status === "draft" ? "Draft" : status === "done" ? "Done" : "Revision";
  const color =
    status === "draft"
      ? "text-[var(--draft)]"
      : status === "done"
        ? "text-accent"
        : "text-[var(--text-2)]";
  return <span className={cn("text-xs font-medium", color)}>{label}</span>;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof BookOpen;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-[var(--text-3)]">
          {label}
        </span>
        <Icon className="h-3.5 w-3.5 text-[var(--text-3)]" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function BookHomePage({ bookId }: { bookId: string }) {
  const { navigate } = useRouter();
  const { data: book, isLoading: bookLoading } = useBook(bookId);
  const { data: chapters } = useChapters(bookId);
  const { data: branches } = useBranches(bookId);
  const deleteBook = useDeleteBook();

  if (bookLoading) return <LoadingSpinner />;
  if (!book) {
    return (
      <div className="mx-auto max-w-4xl p-6 sm:p-8">
        <p className="text-sm text-[var(--text-2)]">Book not found.</p>
      </div>
    );
  }

  function handleDelete() {
    if (!book) return;
    if (
      !window.confirm(
        `Delete "${book.title}"? This permanently removes all chapters, cards, and world data. This can't be undone.`,
      )
    )
      return;
    deleteBook.mutate(book.id, { onSuccess: () => navigate({ name: "library" }) });
  }

  const chapterList = chapters ?? [];
  const branchList = branches ?? [];
  const recentChapters = [...chapterList].slice(-3).reverse();
  const lastBranchDraft = branchList[0]?.lastDraft ?? "—";

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8">
      {/* hero */}
      <section className="mb-8">
        <div className="flex items-center gap-2 text-xs text-[var(--text-3)]">
          <span className="uppercase tracking-wide">{book.genre}</span>
          <span>·</span>
          <span className="capitalize">{book.visibility}</span>
          {book.starred && (
            <>
              <span>·</span>
              <span>Starred</span>
            </>
          )}
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">{book.title}</h1>
        <p className="mt-2 text-sm text-[var(--text-2)]">{book.synopsis}</p>
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-2)]">
          {book.description}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate({ name: "chapters", bookId: book.id })}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <PenLine className="h-3.5 w-3.5" />
            Resume writing
          </button>
          <button
            onClick={() => navigate({ name: "chapters", bookId: book.id })}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-foreground"
          >
            <FileText className="h-3.5 w-3.5" />
            View chapters
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteBook.isPending}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteBook.isPending ? "Deleting…" : "Delete book"}
          </button>
        </div>
      </section>

      {/* stats */}
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Words"
          value={formatWords(book.totalWords)}
          icon={BookOpen}
        />
        <StatCard
          label="Chapters"
          value={String(book.chapterCount)}
          icon={FileText}
        />
        <StatCard
          label="Branches"
          value={String(book.branchCount)}
          icon={GitBranch}
        />
        <StatCard label="Last Draft" value={lastBranchDraft} icon={Clock} />
      </section>

      {/* recent activity */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent chapters</h2>
          <button
            onClick={() => navigate({ name: "chapters", bookId: book.id })}
            className="flex items-center gap-1 text-xs text-[var(--text-3)] transition-colors hover:text-accent"
          >
            All chapters
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {recentChapters.length === 0 && (
            <div className="p-5 text-sm text-[var(--text-3)]">
              No chapters yet — start writing.
            </div>
          )}
          {recentChapters.map((ch, i) => (
            <button
              key={ch.id}
              onClick={() =>
                navigate({
                  name: "editor",
                  bookId: book.id,
                  chapterId: ch.id,
                })
              }
              className={cn(
                "flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-[var(--surface-2)]",
                i > 0 && "border-t border-border",
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs text-[var(--text-2)]">
                {ch.number}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {ch.title}
                  </span>
                  <StatusBadge status={ch.status} />
                </div>
                <p className="truncate text-xs text-[var(--text-3)]">
                  {ch.summary ?? "No summary"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-[var(--text-3)]">
                <span>{formatWords(ch.words)} words</span>
                <span>{ch.updated}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
