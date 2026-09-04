"use client";

import { useState } from "react";
import { Plus, Star, Globe, Lock, X, Check } from "lucide-react";
import type { Book } from "@/lib/data-client";
import { useBooks, useCreateBook, LoadingSpinner } from "@/lib/hooks";
import { useRouter } from "../router";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * My Books — the library grid home page.
 * ------------------------------------------------------------------ */

const GENRE_CHIPS = [
  "Fantasy",
  "Sci-Fi",
  "Literary",
  "Thriller",
  "Mystery",
  "Romance",
  "Historical",
  "Horror",
];

const COVER_OPTIONS: { id: string; label: string; accent: string }[] = [
  { id: "indigo", label: "Indigo", accent: "from-indigo-500/15 to-indigo-500/5" },
  { id: "zinc", label: "Zinc", accent: "from-zinc-400/15 to-zinc-400/5" },
  { id: "emerald", label: "Emerald", accent: "from-emerald-500/15 to-emerald-500/5" },
  { id: "rose", label: "Rose", accent: "from-rose-500/15 to-rose-500/5" },
  { id: "amber", label: "Amber", accent: "from-amber-500/15 to-amber-500/5" },
  { id: "cyan", label: "Cyan", accent: "from-cyan-500/15 to-cyan-500/5" },
];

function formatWords(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k words`;
  return `${n} words`;
}

function BookCard({ book }: { book: Book }) {
  const { navigate } = useRouter();
  return (
    <button
      onClick={() => navigate({ name: "book-home", bookId: book.id })}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-accent/40"
    >
      {/* cover */}
      <div className={cn("relative h-24 bg-gradient-to-br", book.coverAccent)}>
        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          {book.starred && (
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-background/70 text-accent backdrop-blur-sm">
              <Star className="h-3.5 w-3.5 fill-accent" />
            </span>
          )}
          <span className="flex items-center gap-1 rounded-md bg-background/70 px-1.5 py-1 text-[10px] font-medium text-[var(--text-2)] backdrop-blur-sm">
            {book.visibility === "public" ? (
              <Globe className="h-3 w-3" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
            <span className="capitalize">{book.visibility}</span>
          </span>
        </div>
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-semibold text-base leading-tight text-foreground">{book.title}</h3>
          <p className="text-xs uppercase tracking-wide text-[var(--text-3)]">{book.genre}</p>
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-[var(--text-2)]">{book.synopsis}</p>

        {/* progress */}
        <div className="mt-auto space-y-2 pt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${book.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-3)]">
            <span>{formatWords(book.totalWords)}</span>
            <span>{book.chapterCount} ch.</span>
            <span>{book.updated}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function NewBookTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-transparent text-[var(--text-3)] transition-colors hover:border-accent/50 hover:text-accent"
    >
      <Plus className="h-6 w-6" />
      <span className="text-sm font-medium">Start a new book</span>
      <span className="text-xs text-[var(--text-3)]">Blank manuscript</span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * New Book modal — centered overlay.
 * ------------------------------------------------------------------ */

function NewBookModal({ onClose }: { onClose: () => void }) {
  const { navigate } = useRouter();
  const createBook = useCreateBook();
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [cover, setCover] = useState(COVER_OPTIONS[0]);
  void cover; // cover art isn't persisted yet — book.coverAccent stays a client-side default

  function handleCreate() {
    if (!title.trim() || createBook.isPending) return;
    createBook.mutate(
      {
        title: title.trim(),
        genre: genre ?? undefined,
        blurb: synopsis.trim() || undefined,
        visibility,
      },
      {
        onSuccess: (book) => {
          onClose();
          navigate({ name: "book-home", bookId: book.id });
        },
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bh-scroll max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">New Book</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              autoFocus
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* synopsis */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
              Synopsis
            </label>
            <textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="A one-sentence pitch."
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* genre */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
              Genre
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GENRE_CHIPS.map((g) => {
                const active = genre === g;
                return (
                  <button
                    key={g}
                    onClick={() => setGenre(active ? null : g)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      active
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-[var(--text-2)] hover:border-accent/40 hover:text-foreground",
                    )}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* visibility */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
              Visibility
            </label>
            <div className="flex gap-2">
              {(["private", "public"] as const).map((v) => {
                const active = visibility === v;
                return (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm capitalize transition-colors",
                      active
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-[var(--text-2)] hover:border-accent/40 hover:text-foreground",
                    )}
                  >
                    {v === "public" ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {v}
                  </button>
                );
              })}
            </div>
          </div>

          {/* cover color */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
              Cover accent
            </label>
            <div className="grid grid-cols-3 gap-2">
              {COVER_OPTIONS.map((c) => {
                const active = cover.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCover(c)}
                    className={cn(
                      "relative flex h-12 items-center justify-center rounded-md border bg-gradient-to-br text-xs transition-colors",
                      c.accent,
                      active ? "border-accent" : "border-border hover:border-accent/40",
                    )}
                  >
                    <span className="text-[var(--text-2)]">{c.label}</span>
                    {active && (
                      <span className="absolute right-1.5 top-1.5 text-accent">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* actions */}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || createBook.isPending}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            {createBook.isPending ? "Creating…" : "Create book"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MyBooksPage() {
  const { data: books, isLoading } = useBooks();
  const [showModal, setShowModal] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  const bookList = books ?? [];

  return (
    <div className="mx-auto max-w-7xl p-6 sm:p-8">
      {/* header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Books</h1>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            {bookList.length} {bookList.length === 1 ? "book" : "books"} in your workspace
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 self-start rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          New Book
        </button>
      </div>

      {/* grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {bookList.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
        <NewBookTile onClick={() => setShowModal(true)} />
      </div>

      {showModal && <NewBookModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
