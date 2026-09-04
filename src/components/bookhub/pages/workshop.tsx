"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Lightbulb,
  Send,
  Bot,
  Loader2,
  Sparkles,
  ArrowRight,
  X,
  Check,
  AlertTriangle,
  Upload,
  Paperclip,
} from "lucide-react";
import { useBook, useUpdateBook, LoadingSpinner } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * WorkShop — the incubator.
 *
 * Three panels:
 *   LEFT: unstructured notes (textarea + file upload, persisted to books.workshop_notes)
 *   RIGHT: AI chat with context = notes + existing World Bible
 *   BOTTOM: extracted entity candidates → dispatch to Bible tabs
 * ------------------------------------------------------------------ */

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ExtractedEntity = {
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
};

type ExtractedLink = {
  from: string;
  to: string;
  label: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  magic: "Magic Systems",
  cosmology: "Cosmology",
  geography: "Geography",
  factions: "Factions",
  history: "History",
  bestiary: "Bestiary",
  character: "Cast",
};

export function WorkShopPage({ bookId }: { bookId: string }) {
  const { data: book, isLoading } = useBook(bookId);
  const updateBook = useUpdateBook();

  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [entities, setEntities] = useState<ExtractedEntity[] | null>(null);
  const [extractedLinks, setExtractedLinks] = useState<ExtractedLink[]>([]);
  const [createdCardIds, setCreatedCardIds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (book?.workshopNotes !== undefined) {
      setNotes(book.workshopNotes ?? "");
    }
  }, [book?.workshopNotes]);

  const saveNotes = useCallback((text: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateBook.mutate({ id: bookId, updates: { workshopNotes: text } });
      setNotesDirty(false);
    }, 1500);
  }, [bookId, updateBook]);

  function handleNotesChange(text: string) {
    setNotes(text);
    setNotesDirty(true);
    saveNotes(text);
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  /* ----- File upload ----- */
  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    setUploading(true);
    setError(null);

    try {
      for (const file of fileArray) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        let text = "";

        if (ext === "txt" || ext === "md" || ext === "csv" || ext === "json") {
          // Read as text directly
          text = await file.text();
        } else if (ext === "docx") {
          // Extract text from .docx using mammoth
          const arrayBuffer = await file.arrayBuffer();
          const mammoth = await import("mammoth/mammoth.browser");
          const result = await mammoth.extractRawText({ arrayBuffer });
          text = result.value;
        } else if (ext === "pdf") {
          // For PDF, read as text — works for some PDFs, otherwise show message
          text = await file.text();
          if (text.includes("%PDF")) {
            setError("PDF text extraction is limited. For best results, copy-paste the text from your PDF into the notes.");
            continue;
          }
        } else {
          // Try reading as text
          text = await file.text();
        }

        if (text.trim()) {
          const header = `\n\n--- ${file.name} ---\n`;
          handleNotesChange(notes + header + text.trim() + "\n---\n");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  /* ----- AI chat ----- */
  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    doSend(text);
  }

  async function handleSendNotesToAI() {
    if (!notes.trim() || loading) return;
    doSend(`Here are my raw workshop notes — help me brainstorm and structure these ideas:\n\n${notes}`);
  }

  async function doSend(text: string) {
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          scope: { type: "overview", bookId },
          messages: [...messages, { role: "user", content: text }].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          extra: `WORKSHOP NOTES (unstructured brainstorming):\n${notes}`,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  /* ----- Extract entities ----- */
  async function handleExtract() {
    setExtracting(true);
    setError(null);
    setEntities(null);

    try {
      const res = await fetch("/api/ai/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          action: "extract_entities",
          scope: { type: "overview", bookId },
          extra: `WORKSHOP NOTES:\n${notes}\n\nCHAT HISTORY:\n${messages.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const structured = data.structured;
      if (Array.isArray(structured)) {
        setEntities(structured);
        setExtractedLinks([]);
        setCreatedCardIds({});
      } else if (structured && Array.isArray(structured.entities)) {
        setEntities(structured.entities);
        setExtractedLinks(structured.links ?? []);
        setCreatedCardIds({});
      } else {
        setError("AI returned an unexpected format. Try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSendToTab(entity: ExtractedEntity, index: number) {
    try {
      const res = await fetch(`/api/books/${bookId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: entity.category,
          title: entity.title,
          summary: entity.summary,
          body: entity.body,
          canonStatus: "draft",
          tags: entity.tags ?? [],
          fields: [],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const cardId = data.card?.id;
        if (cardId) {
          setCreatedCardIds((prev) => ({ ...prev, [entity.title]: cardId }));
          tryCreateLinks();
        }
      }
      setEntities((prev) => prev?.filter((_, i) => i !== index) ?? null);
    } catch {
      setError("Failed to create card");
    }
  }

  function tryCreateLinks() {
    for (const link of extractedLinks) {
      const fromId = createdCardIds[link.from];
      const toId = createdCardIds[link.to];
      if (fromId && toId) {
        fetch(`/api/books/${bookId}/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromCardId: fromId, toCardId: toId, label: link.label }),
        }).catch(() => {});
      }
    }
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-3">
        <Lightbulb className="h-4 w-4 text-accent" />
        <h1 className="text-lg font-semibold text-foreground">WorkShop</h1>
        <span className="text-xs text-[var(--text-3)]">
          Brainstorm freely. The AI sees your notes and your world.
        </span>
        <div className="ml-auto flex items-center gap-2">
          {notesDirty && <span className="text-xs text-[var(--text-3)]">Saving…</span>}
          <button
            onClick={handleExtract}
            disabled={extracting || (!notes.trim() && messages.length === 0)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground disabled:opacity-40"
          >
            {extracting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Extracting…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 text-accent" /> Extract to World Bible
              </>
            )}
          </button>
        </div>
      </div>

      {/* main split: left notes + right chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: unstructured notes + file upload */}
        <div
          className="flex w-[40%] min-w-[300px] flex-col border-r border-border"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="shrink-0 flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
              Raw ideas
            </span>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.md,.csv,.json,.docx,.pdf"
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-[10px] text-[var(--text-3)] hover:text-foreground disabled:opacity-40"
                title="Upload .txt, .md, .docx, .pdf files"
              >
                {uploading ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Reading…</>
                ) : (
                  <><Upload className="h-3 w-3" /> Upload</>
                )}
              </button>
            </div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Paste raw text, type scattered thoughts, drop outlines…

Or drag a .txt, .md, .docx file here — its content will be added to these notes.

This space is meant to be messy. The AI reads this alongside your World Bible and helps you structure it."
            className={cn(
              "bh-scroll flex-1 resize-none border-0 bg-background p-4 font-mono text-[13px] leading-relaxed text-foreground/90 placeholder:text-[var(--text-3)] focus:outline-none transition-colors",
              dragOver && "bg-accent/5",
            )}
            style={{ minHeight: "150px" }}
          />
          {/* drag overlay hint */}
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent/10">
              <div className="flex flex-col items-center gap-2 text-accent">
                <Upload className="h-8 w-8" />
                <span className="text-sm font-medium">Drop files here</span>
              </div>
            </div>
          )}
          {/* Send to AI button */}
          <div className="shrink-0 border-t border-border p-2">
            <button
              onClick={handleSendNotesToAI}
              disabled={!notes.trim() || loading}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-40"
            >
              <Send className="h-3 w-3" />
              Brainstorm with AI
            </button>
          </div>
        </div>

        {/* RIGHT: AI chat */}
        <div className="flex flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-4 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
              <Bot className="h-3 w-3 text-accent" />
              AI Conversation
            </span>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="bh-scroll flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && !loading && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background">
                  <Lightbulb className="h-4 w-4 text-[var(--text-3)]" />
                </div>
                <p className="text-sm font-medium text-foreground">WorkShop AI</p>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-2)]">
                  Talk through your ideas. The AI sees your raw notes (left) and your
                  existing World Bible.
                </p>
                <p className="mt-1 text-[10px] text-[var(--text-3)]">
                  When ready, click "Extract to World Bible" to create structured cards.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    msg.role === "user" ? "bg-accent/10" : "bg-card",
                  )}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    {msg.role === "user" ? (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-3)]">You</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-accent">
                        <Bot className="h-2.5 w-2.5" /> AI
                      </span>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed text-foreground/90">
                    {msg.content}
                  </div>
                  {/* Extract button on AI messages */}
                  {msg.role === "assistant" && !extracting && (
                    <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
                      <button
                        onClick={handleExtract}
                        disabled={!notes.trim() && messages.length === 0}
                        className="flex items-center gap-1 rounded-md border border-accent/30 bg-accent/5 px-2.5 py-1 text-[10px] font-medium text-accent hover:bg-accent/10 disabled:opacity-40"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        Extract to World Bible
                      </button>
                      <span className="text-[9px] text-[var(--text-3)]">
                        Scans notes + chat → creates draft cards
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm text-[var(--text-3)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking…
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* input */}
          <div className="shrink-0 border-t border-border p-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Brainstorm, ask questions, flesh out ideas…"
                disabled={loading}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-[var(--text-3)] focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="text-[var(--text-3)] hover:text-foreground disabled:opacity-30"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM: extracted entities (dispatch panel) */}
      {entities && (
        <div className="shrink-0 max-h-[200px] overflow-y-auto border-t border-border bg-card">
          <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
              Extracted entities ({entities.length})
            </span>
            <button
              onClick={() => { setEntities(null); setExtractedLinks([]); }}
              className="text-[var(--text-3)] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {entities.length === 0 && extractedLinks.length === 0 ? (
              <p className="col-span-full py-4 text-center text-xs text-[var(--text-3)]">
                All entities dispatched to your World Bible.
              </p>
            ) : (
              <>
                {entities.map((entity, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-medium uppercase",
                        entity.category === "character" ? "bg-accent/15 text-accent" : "bg-muted text-[var(--text-2)]",
                      )}>
                        {CATEGORY_LABELS[entity.category] ?? entity.category}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">
                        {entity.title}
                      </span>
                    </div>
                    <p className="mb-2 line-clamp-2 text-xs text-[var(--text-2)]">
                      {entity.summary}
                    </p>
                    <button
                      onClick={() => handleSendToTab(entity, i)}
                      className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[10px] font-medium text-accent-foreground hover:bg-accent/90"
                    >
                      Send to {CATEGORY_LABELS[entity.category] ?? entity.category}
                      <ArrowRight className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {extractedLinks.length > 0 && entities.length === 0 && (
                  <div className="col-span-full mt-2 rounded-lg border border-accent/20 bg-accent/5 p-3">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-accent">
                      {extractedLinks.length} link{extractedLinks.length !== 1 ? "s" : ""} created
                    </p>
                    {extractedLinks.map((link, i) => (
                      <p key={i} className="text-xs text-[var(--text-2)]">
                        <span className="font-medium text-foreground">{link.from}</span>
                        {" → "}
                        <span className="font-medium text-foreground">{link.to}</span>
                        {link.label && <span className="text-[var(--text-3)]"> ({link.label})</span>}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
