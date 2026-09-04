"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Pencil, History, FileText, Trash2, X, GripVertical } from "lucide-react";
import { useChapters, useCreateChapter, useDeleteChapter, useReorderChapters, LoadingSpinner } from "@/lib/hooks";
import type { Chapter } from "@/lib/data-client";
import { useRouter } from "../router";
import { cn } from "@/lib/utils";

function formatWords(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function StatusBadge({ status }: { status: Chapter["status"] }) {
  const label = status === "draft" ? "Draft" : status === "done" ? "Done" : "Revision";
  const color =
    status === "draft"
      ? "text-[var(--draft)]"
      : status === "done"
        ? "text-accent"
        : "text-[var(--text-2)]";
  return <span className={cn("text-xs font-medium", color)}>{label}</span>;
}

/* ------------------------------------------------------------------ *
 * Sortable chapter row
 * ------------------------------------------------------------------ */
function SortableChapterRow({
  ch,
  index,
  bookId,
  navigate,
  onDelete,
}: {
  ch: Chapter;
  index: number;
  bookId: string;
  navigate: ReturnType<typeof useRouter>["navigate"];
  onDelete: (e: React.MouseEvent, ch: Chapter) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ch.id });
  const [hover, setHover] = useState(false);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "group flex items-center gap-3 p-4 transition-colors hover:bg-[var(--surface-2)]",
        index > 0 && "border-t border-border",
      )}
    >
      {/* drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-[var(--text-3)] opacity-0 transition-opacity hover:text-foreground active:cursor-grabbing group-hover:opacity-100"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* chapter number badge */}
      <button
        onClick={() => navigate({ name: "editor", bookId, chapterId: ch.id })}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs text-[var(--text-2)]"
      >
        {index + 1}
      </button>

      {/* title + summary */}
      <button
        onClick={() => navigate({ name: "editor", bookId, chapterId: ch.id })}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
      >
        <span className="truncate text-sm font-medium text-foreground">
          {ch.title}
        </span>
        {ch.summary && (
          <span className="truncate text-xs text-[var(--text-3)]">
            {ch.summary}
          </span>
        )}
      </button>

      {/* meta */}
      <div className="flex shrink-0 items-center gap-4">
        <span className="text-xs text-[var(--text-3)]">
          {formatWords(ch.words)} words
        </span>
        <StatusBadge status={ch.status} />
        <span className="hidden text-xs text-[var(--text-3)] sm:inline">
          {ch.updated}
        </span>

        {/* hover actions */}
        <div className={cn("flex items-center gap-1 transition-opacity", hover ? "opacity-100" : "opacity-0")}>
          <button
            onClick={() => navigate({ name: "editor", bookId, chapterId: ch.id })}
            className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--background)] hover:text-accent"
            title="Edit chapter"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => navigate({ name: "states", bookId })}
            className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--background)] hover:text-accent"
            title="View draft history"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => onDelete(e, ch)}
            className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--background)] hover:text-rose-400"
            title="Delete chapter"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * New Chapter modal
 * ------------------------------------------------------------------ */
function NewChapterModal({
  nextNumber,
  isPending,
  placeholder,
  onClose,
  onCreate,
}: {
  nextNumber: number;
  isPending: boolean;
  placeholder: string;
  onClose: () => void;
  onCreate: (title: string) => void;
}) {
  const [title, setTitle] = useState("");

  function submit() {
    if (isPending) return;
    onCreate(title.trim() || placeholder);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">New Chapter</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            {isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */
export function ChaptersPage({ bookId }: { bookId: string }) {
  const { navigate } = useRouter();
  const { data: chapters, isLoading } = useChapters(bookId);
  const createChapter = useCreateChapter();
  const deleteChapter = useDeleteChapter();
  const reorderMut = useReorderChapters();
  const [showNew, setShowNew] = useState(false);
  const [localOrder, setLocalOrder] = useState<Chapter[] | null>(null);

  // Sync local order when chapters data changes
  const [lastChaptersKey, setLastChaptersKey] = useState(chapters);
  if (chapters !== lastChaptersKey) {
    setLastChaptersKey(chapters);
    setLocalOrder(null); // reset to API order
  }

  const chapterList = (localOrder ?? chapters ?? []).slice().sort((a, b) => (a.sortOrder ?? a.number - 1) - (b.sortOrder ?? b.number - 1));
  const nextSortOrder = chapterList.length
    ? Math.max(...chapterList.map((c) => c.sortOrder ?? c.number - 1)) + 1
    : 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = chapterList.findIndex((c) => c.id === active.id);
    const newIndex = chapterList.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(chapterList, oldIndex, newIndex);
    setLocalOrder(reordered);

    // Persist new sort orders to the API
    const order = reordered.map((c, i) => ({ id: c.id, sortOrder: i }));
    reorderMut.mutate({ bookId, order });
  }

  function handleCreate(title: string) {
    createChapter.mutate(
      { bookId, input: { title, sortOrder: nextSortOrder } },
      { onSuccess: () => setShowNew(false) },
    );
  }

  function handleDelete(e: React.MouseEvent, ch: Chapter) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${ch.title}"? This can't be undone.`)) return;
    deleteChapter.mutate(ch.id);
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-8">
      {/* header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Chapters</h1>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            {chapterList.length} {chapterList.length === 1 ? "chapter" : "chapters"}
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 self-start rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          New Chapter
        </button>
      </div>

      {/* empty state */}
      {chapterList.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
          <FileText className="h-6 w-6 text-[var(--text-3)]" />
          <p className="text-sm text-[var(--text-2)]">
            No chapters yet. Start writing your first chapter.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={chapterList.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {chapterList.map((ch, i) => (
                <SortableChapterRow
                  key={ch.id}
                  ch={ch}
                  index={i}
                  bookId={bookId}
                  navigate={navigate}
                  onDelete={handleDelete}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* footer hint */}
      {chapterList.length > 0 && (
        <p className="mt-4 text-xs text-[var(--text-3)]">
          Drag to reorder · Click any chapter to open the editor · Hover for actions
        </p>
      )}

      {showNew && (
        <NewChapterModal
          nextNumber={nextSortOrder + 1}
          isPending={createChapter.isPending}
          placeholder={`Chapter ${nextSortOrder + 1}`}
          onClose={() => setShowNew(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
