"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles, AlertTriangle, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiErrorBanner, type AiErrorInfo } from "@/components/bookhub/ai-error-banner";

/* ------------------------------------------------------------------ *
 * AiChatPanel — real chat interface for the editor AI tab.
 * 
 * Session memory: messages are lifted to the parent (EditorPage),
 * stored per-chapterId, so switching tabs (Lore → AI → Drafts → AI)
 * preserves the conversation.
 * ------------------------------------------------------------------ */

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  guard?: { rule: string; severity: string; quote: string; suggestion: string }[];
};

export type ContinuePreview = {
  text: string;
  guard?: { rule: string; severity: string; quote: string; suggestion: string }[];
};

export type ChatSession = {
  messages: ChatMessage[];
  continuePreview: ContinuePreview | null;
};

export function AiChatPanel({
  bookId,
  chapterId,
  chapterNumber,
  chapterTitle,
  mentionCount,
  stateCount,
  onInsertText,
  messages,
  setMessages,
  continuePreview,
  setContinuePreview,
}: {
  bookId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  mentionCount: number;
  stateCount: number;
  onInsertText: (text: string) => void;
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  continuePreview: ContinuePreview | null;
  setContinuePreview: (preview: ContinuePreview | null) => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [error, setError] = useState<AiErrorInfo | null>(null);
  const [lastChatText, setLastChatText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev: ChatMessage[]) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);
    setLastChatText(text);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          scope: { type: "editor", bookId, chapterId },
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
      setMessages((prev: ChatMessage[]) => [
        ...prev,
        { role: "assistant", content: data.text, guard: data.guard },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError({ message: msg, kind: undefined });
      // Re-inject the user message so they can edit & resend
      setMessages((prev: ChatMessage[]) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleContinue() {
    setContinueLoading(true);
    setError(null);
    setContinuePreview(null);

    try {
      const res = await fetch("/api/ai/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          action: "continue_chapter",
          scope: { type: "editor", bookId, chapterId },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setContinuePreview({
        text: data.text,
        guard: data.guard,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError({ message: msg, kind: undefined });
    } finally {
      setContinueLoading(false);
    }
  }

  function handleInsert() {
    if (!continuePreview) return;
    onInsertText(continuePreview.text);
    // Log to cut log as "inserted"
    fetch(`/api/books/${bookId}/ai-cut-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "ai_proposal",
        kind: "inserted",
        beforeText: continuePreview.text,
      }),
    }).catch(() => {});
    setContinuePreview(null);
  }

  function handleDiscard() {
    if (!continuePreview) return;
    // Log to cut log as "discarded"
    fetch(`/api/books/${bookId}/ai-cut-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "ai_proposal",
        kind: "discarded",
        beforeText: continuePreview.text,
      }),
    }).catch(() => {});
    setContinuePreview(null);
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* scope line */}
      <div className="shrink-0 border-b border-border px-4 py-2">
        <button
          onClick={() => setShowContext((s) => !s)}
          className="flex w-full items-center gap-1 text-left"
        >
          <span className="text-[11px] text-[var(--text-3)]">
            Ch {chapterNumber} — {chapterTitle}
            {mentionCount > 0 && ` · ${mentionCount} char`}
            {stateCount > 0 && ` · ${stateCount} states`}
            {" · constitution ON"}
          </span>
          <span className="ml-auto text-[10px] text-[var(--text-3)]">
            {showContext ? "hide" : "see"}
          </span>
        </button>
        {showContext && (
          <div className="mt-1.5 rounded-md border border-border bg-background p-2 text-[10px] leading-relaxed text-[var(--text-3)]">
            Context layers: Constitution (9 rules) + Fingerprint + Glossary + World summary + Chapter prose (last ~1500 chars) + Chapter state + Character sheets. Total ~24k chars budget.
          </div>
        )}
      </div>

      {/* PROMINENT ERROR BANNER — sticky above the messages */}
      {error && (
        <div className="shrink-0 border-b border-rose-500/20 px-3 py-2">
          <AiErrorBanner
            key={`${error.kind ?? "unknown"}-${error.message.slice(0, 50)}`}
            error={error}
            bookId={bookId}
            onDismiss={() => setError(null)}
            className="border-rose-500/30 bg-rose-500/5"
          />
        </div>
      )}

      {/* messages */}
      <div ref={scrollRef} className="bh-scroll flex-1 overflow-y-auto px-4 py-3">
        {!hasMessages && !continuePreview && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background">
              <Bot className="h-4 w-4 text-[var(--text-3)]" />
            </div>
            <p className="text-sm font-medium text-foreground">AI Chat</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-2)]">
              Ask questions, brainstorm passages, or get unstuck.
            </p>
            <p className="mt-1 text-[10px] text-[var(--text-3)]">
              The AI can see your chapter prose, characters, and world rules.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-accent/10 text-foreground"
                  : "bg-card text-foreground",
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
              {/* guard flags */}
              {msg.guard && msg.guard.length > 0 && (
                <div className="mt-2 space-y-1 rounded-md border border-[var(--draft)]/30 bg-[var(--draft)]/5 p-2">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-[var(--draft)]">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Guard: {msg.guard.length} flag{msg.guard.length !== 1 ? "s" : ""}
                  </div>
                  {msg.guard.map((g, gi) => (
                    <div key={gi} className="text-[10px] text-[var(--text-2)]">
                      <span className="font-medium">{g.rule}:</span> {g.quote} → {g.suggestion}
                    </div>
                  ))}
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

          {/* continue preview */}
          {continuePreview && (
            <div className="rounded-lg border border-dashed border-accent/40 bg-accent/5 px-3 py-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-accent" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-accent">
                  Continue preview
                </span>
              </div>
              <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground/80">
                {continuePreview.text}
              </div>
              {continuePreview.guard && continuePreview.guard.length > 0 && (
                <div className="mt-2 space-y-1 rounded-md border border-[var(--draft)]/30 bg-[var(--draft)]/5 p-2">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-[var(--draft)]">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Guard: {continuePreview.guard.length} flag{continuePreview.guard.length !== 1 ? "s" : ""}
                  </div>
                  {continuePreview.guard.map((g, gi) => (
                    <div key={gi} className="text-[10px] text-[var(--text-2)]">
                      <span className="font-medium">{g.rule}:</span> {g.quote} → {g.suggestion}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleInsert}
                  className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90"
                >
                  <Check className="h-3 w-3" /> Insert
                </button>
                <button
                  onClick={handleDiscard}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                >
                  <X className="h-3 w-3" /> Discard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* continue button */}
      {!continuePreview && (
        <div className="shrink-0 border-t border-border px-3 py-2">
          <button
            onClick={handleContinue}
            disabled={continueLoading}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-foreground disabled:opacity-50"
          >
            {continueLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 text-accent" /> Continue writing
              </>
            )}
          </button>
        </div>
      )}

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
            placeholder="Ask about your story…"
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
  );
}
