"use client";

import { useEffect, useState, useRef } from "react";
import { Bot, X, Send, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * AiDock — shared AI chat panel (right side, 400px).
 * 
 * Opens from Bible tab toolbars. Real chat interface that calls
 * /api/ai/chat with the appropriate scope.
 * Esc closes; open/closed state remembered per session.
 * ------------------------------------------------------------------ */

const SESSION_KEY = "bh-ai-dock-open";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  guard?: { rule: string; severity: string; quote: string; suggestion: string }[];
};

export function useAiDock() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  });
  const [scope, setScope] = useState("");
  const [scopeData, setScopeData] = useState<{
    bookId?: string;
    tab?: string;
    cardId?: string;
  }>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(SESSION_KEY, open ? "1" : "0");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function openWith(scopeText: string, data?: { bookId?: string; tab?: string; cardId?: string }) {
    setScope(scopeText);
    if (data) setScopeData(data);
    setOpen(true);
  }

  return { open, scope, scopeData, setOpen, openWith };
}

export function AiDock({
  open,
  scope,
  scopeData,
  onClose,
}: {
  open: boolean;
  scope: string;
  scopeData?: { bookId?: string; tab?: string; cardId?: string };
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brainstormLoading, setBrainstormLoading] = useState(false);
  const [brainstormResults, setBrainstormResults] = useState<
    { title: string; summary: string; body: string; tags: string[] }[] | null
  >(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Clear messages when scope changes
  useEffect(() => {
    setMessages([]);
    setBrainstormResults(null);
  }, [scope]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || !scopeData?.bookId) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const scopeBody = scopeData.tab
        ? { type: "tab", bookId: scopeData.bookId, tab: scopeData.tab }
        : scopeData.cardId
          ? { type: "card", bookId: scopeData.bookId, cardId: scopeData.cardId }
          : { type: "overview", bookId: scopeData.bookId };

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: scopeData.bookId,
          scope: scopeBody,
          messages: [...messages, { role: "user", content: text }].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.text, guard: data.guard },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleBrainstorm() {
    if (!scopeData?.bookId || !scopeData?.tab) return;
    setBrainstormLoading(true);
    setError(null);
    setBrainstormResults(null);

    try {
      const res = await fetch("/api/ai/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: scopeData.bookId,
          action: "brainstorm_tab",
          scope: { type: "tab", bookId: scopeData.bookId, tab: scopeData.tab },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const candidates = data.structured as { title: string; summary: string; body: string; tags: string[] }[];
      if (Array.isArray(candidates)) {
        setBrainstormResults(candidates);
      } else {
        setError("AI returned an unexpected format. Try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brainstorm failed");
    } finally {
      setBrainstormLoading(false);
    }
  }

  async function handleCreateCard(candidate: { title: string; summary: string; body: string; tags: string[] }) {
    if (!scopeData?.bookId || !scopeData?.tab) return;
    try {
      await fetch(`/api/books/${scopeData.bookId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: scopeData.tab,
          title: candidate.title,
          summary: candidate.summary,
          body: candidate.body,
          canonStatus: "draft",
          tags: candidate.tags ?? [],
          fields: [],
        }),
      });
      // Remove from brainstorm results
      setBrainstormResults((prev) =>
        prev?.filter((c) => c.title !== candidate.title) ?? null,
      );
    } catch {
      setError("Failed to create card");
    }
  }

  if (!open) return null;

  const hasMessages = messages.length > 0;

  return (
    <aside className="fixed right-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-[400px] flex-col border-l border-border bg-card">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent" />
          <span className="text-[13px] font-medium text-foreground">AI Studio</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* scope line */}
      <div className="shrink-0 border-b border-border px-5 py-2.5">
        <p className="text-[11px] text-[var(--text-3)]">
          {scope || "See what the AI will see."}
        </p>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="bh-scroll flex-1 overflow-y-auto px-4 py-3">
        {!hasMessages && !brainstormResults && !brainstormLoading && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background">
              <Bot className="h-4 w-4 text-[var(--text-3)]" />
            </div>
            <p className="text-sm font-medium text-foreground">AI Chat</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-2)]">
              Ask questions, brainstorm, or check consistency.
              The AI can see your world cards and rules.
            </p>
            {/* Brainstorm button (only on tab scope) */}
            {scopeData?.tab && (
              <button
                onClick={handleBrainstorm}
                className="mt-4 flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
              >
                <Sparkles className="h-3 w-3 text-accent" />
                Brainstorm cards
              </button>
            )}
          </div>
        )}

        {/* brainstorm loading */}
        {brainstormLoading && (
          <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm text-[var(--text-3)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Brainstorming…
          </div>
        )}

        {/* brainstorm results */}
        {brainstormResults && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-3)]">
              Brainstorm candidates
            </p>
            {brainstormResults.map((c, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-3">
                <div className="text-sm font-medium text-foreground">{c.title}</div>
                <p className="mt-1 text-xs text-[var(--text-2)]">{c.summary}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => handleCreateCard(c)}
                    className="rounded-md bg-accent px-2.5 py-1 text-[10px] font-medium text-accent-foreground hover:bg-accent/90"
                  >
                    Create card
                  </button>
                  <button
                    onClick={() => setBrainstormResults((prev) => prev?.filter((_, idx) => idx !== i) ?? null)}
                    className="rounded-md border border-border px-2.5 py-1 text-[10px] text-[var(--text-3)] hover:bg-[var(--surface-2)]"
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
            {brainstormResults.length === 0 && (
              <p className="text-xs text-[var(--text-3)]">All candidates actioned.</p>
            )}
          </div>
        )}

        {/* chat messages */}
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                msg.role === "user" ? "bg-accent/10" : "bg-background",
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
              {msg.guard && msg.guard.length > 0 && (
                <div className="mt-2 rounded-md border border-[var(--draft)]/30 bg-[var(--draft)]/5 p-2">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-[var(--draft)]">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Guard: {msg.guard.length} flag{msg.guard.length !== 1 ? "s" : ""}
                  </div>
                  {msg.guard.map((g, gi) => (
                    <div key={gi} className="mt-0.5 text-[10px] text-[var(--text-2)]">
                      {g.rule}: {g.quote}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm text-[var(--text-3)]">
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
            placeholder="Ask about your world…"
            disabled={loading || !scopeData?.bookId}
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
    </aside>
  );
}
