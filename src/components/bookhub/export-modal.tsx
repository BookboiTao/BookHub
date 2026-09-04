"use client";

import { useState } from "react";
import {
  Download,
  X,
  FileText,
  FileType,
  BookOpen,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Export modal
 *
 * Lets the writer download their book as a file.
 * Formats: Markdown (.md), Plain text (.txt)
 * Runs fully in the browser — no backend.
 * ------------------------------------------------------------------ */

type Format = "markdown" | "txt";

const FORMATS: {
  id: Format;
  label: string;
  icon: typeof FileText;
  desc: string;
  ext: string;
}[] = [
  {
    id: "markdown",
    label: "Markdown",
    icon: FileText,
    desc: "Chapter headings, paragraph breaks preserved. Opens in any markdown editor.",
    ext: "md",
  },
  {
    id: "txt",
    label: "Plain text",
    icon: FileType,
    desc: "No formatting. Just the words. Opens anywhere.",
    ext: "txt",
  },
];

// mock chapter data — would come from the book's chapters
const CHAPTERS = [
  {
    title: "Chapter 1 — The Awakening",
    body:
      "The lanterns along the quay had burned down to stumps by the time Maren reached the harbour. She could still hear the bells of Vaelhold ringing behind her — one, two, three — counting out the hours she didn't have.\n\n\"You're late,\" said the figure on the dock.\n\n\"I'm alive,\" Maren answered. \"That's more than the schedule promised.\"\n\nThe figure laughed, low and unkind, and gestured toward the boat. It sat low in the black water, its sail furled, its name scraped off the bow as if the ship itself wanted to be forgotten. Maren hesitated for only a moment. Then she stepped aboard, and the harbour, and the bells, and every version of her life she had ever been told to want — fell away behind her.",
  },
  {
    title: "Chapter 2 — The Ashfall",
    body:
      "The Ashfall came on the second morning.\n\nMaren woke to a sky the colour of a bruise, and a fine grey dust sifting down through the rigging like the first snow of a world that had forgotten how to be warm.",
  },
  {
    title: "Chapter 3 — The Ambush",
    body:
      "The ambush was waiting for them in the gorge.\n\nThree figures on the high rocks, bows drawn, the cold morning light catching the steel. Maren didn't stop walking. That was the thing about being the kind of person who stole boats and futures — you learned, eventually, that flinching only ever bought you a slower death.",
  },
];

function buildMarkdown(title: string, author: string): string {
  let out = `# ${title}\n\n`;
  out += `*by ${author}*\n\n`;
  out += `---\n\n`;
  for (const ch of CHAPTERS) {
    out += `## ${ch.title}\n\n${ch.body}\n\n---\n\n`;
  }
  return out;
}

function buildPlainText(title: string, author: string): string {
  let out = `${title.toUpperCase()}\n`;
  out += `by ${author}\n`;
  out += `${"=".repeat(40)}\n\n\n`;
  for (const ch of CHAPTERS) {
    out += `${ch.title.toUpperCase()}\n`;
    out += `${"-".repeat(40)}\n\n`;
    out += `${ch.body}\n\n\n`;
  }
  return out;
}

function download(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportModal({
  bookTitle,
  bookAuthor,
  onClose,
}: {
  bookTitle: string;
  bookAuthor: string;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>("markdown");
  const [done, setDone] = useState(false);

  const handleExport = () => {
    const content =
      format === "markdown"
        ? buildMarkdown(bookTitle, bookAuthor)
        : buildPlainText(bookTitle, bookAuthor);

    const ext = format === "markdown" ? "md" : "txt";
    const filename = `${bookTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.${ext}`;
    const mime = format === "markdown" ? "text/markdown" : "text/plain";

    download(filename, content, mime);
    setDone(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        {/* header */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Download className="h-5 w-5 text-primary" />
          <h2 className="font-serif text-lg font-semibold">Export book</h2>
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-7 w-7 text-emerald-400" />
            </div>
            <h3 className="font-serif text-xl font-semibold">Downloaded!</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your book is in your downloads folder. Your words, your file —
              take them anywhere.
            </p>
            <button
              onClick={onClose}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            {/* book info */}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{bookTitle}</div>
                <div className="text-xs text-muted-foreground">
                  by {bookAuthor} · {CHAPTERS.length} chapters
                </div>
              </div>
            </div>

            {/* format picker */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Format
              </label>
              <div className="space-y-2">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      format === f.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        format === f.id
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <f.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{f.label}</span>
                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          .{f.ext}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {f.desc}
                      </p>
                    </div>
                    {format === f.id && (
                      <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* trust note */}
            <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Your content, your file.</span>{" "}
                Export runs in your browser. Nothing is sent to a server. You can
                leave BookHub anytime with your words intact.
              </p>
            </div>

            {/* actions */}
            <div className="flex gap-2 border-t border-border pt-4">
              <button
                onClick={onClose}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
