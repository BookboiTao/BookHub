"use client";

/* ------------------------------------------------------------------ *
 * StoryStructurePanel — the Story Structure Bot. Chapter-level check
 * against the Study of Story guide's Foundations (Event, Causality,
 * Change, Resolution, Conflict) plus how the chapter sits against the
 * book's own Story Profile (Structure, Cast) if one's been generated.
 *
 * Deliberately read-only, same as the Mechanical/Grammar groups in
 * ProseCritiquePanel and for the same reason: "this chapter has no real
 * causality" isn't a literal text replacement the way an AI-critique fix
 * is — there's nothing to Accept, only something to go think about and
 * rewrite yourself. This is a diagnostic, not a prose generator.
 * ------------------------------------------------------------------ */

import { useState } from "react";
import { Compass, Loader2, Check, Minus, AlertTriangle } from "lucide-react";
import { AiErrorBanner, type AiErrorInfo } from "@/components/bookhub/ai-error-banner";

type FoundationItem = { present?: boolean; mode?: string; note: string };
type StructureResult = {
  foundations: {
    event: FoundationItem;
    causality: FoundationItem;
    change: FoundationItem;
    resolution: FoundationItem;
    conflict: FoundationItem;
  };
  alignmentNotes: string[];
};

const LABELS: Record<keyof StructureResult["foundations"], string> = {
  event: "Event",
  causality: "Causality",
  change: "Change",
  resolution: "Resolution",
  conflict: "Conflict / resistance",
};

export function StoryStructurePanel({ bookId, chapterId }: { bookId: string; chapterId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiErrorInfo | null>(null);
  const [result, setResult] = useState<StructureResult | null>(null);

  async function handleCheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          action: "check_story_structure",
          scope: { type: "editor", bookId, chapterId },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.structured?.foundations) {
        throw new Error("The AI didn't return a usable structure check. Try again.");
      }
      setResult(data.structured);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Something went wrong", kind: undefined });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Compass className="h-3.5 w-3.5 text-accent" />
        <span className="text-xs font-semibold">Check story structure</span>
        <span className="text-[10px] text-[var(--text-3)]">— Story Structure Bot</span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-2)]">
        Does this chapter actually function as a piece of story — Event, Causality, Change, Resolution, Conflict — and does it line up with your Story Profile. Read-only, nothing here edits your text.
      </p>

      {error && (
        <div className="mb-3">
          <AiErrorBanner
            key={`${error.kind ?? "unknown"}-${error.message.slice(0, 50)}`}
            error={error}
            bookId={bookId}
            onDismiss={() => setError(null)}
          />
        </div>
      )}

      <button
        onClick={handleCheck}
        disabled={loading}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-40"
      >
        {loading ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Checking…
          </>
        ) : (
          <>
            <Compass className="h-3 w-3" /> Check story structure
          </>
        )}
      </button>

      {result && !loading && (
        <div className="mt-3 space-y-1.5">
          {(Object.keys(LABELS) as (keyof StructureResult["foundations"])[]).map((key) => {
            const item = result.foundations[key];
            const isAbsent = item.present === false || item.mode === "None";
            return (
              <div
                key={key}
                className={
                  "rounded-md border p-2 text-[11px] " +
                  (isAbsent ? "border-[var(--draft)]/30 bg-[var(--draft)]/5" : "border-border bg-[var(--surface-2)]")
                }
              >
                <div className="mb-0.5 flex items-center gap-1.5 font-medium text-foreground">
                  {isAbsent ? (
                    <Minus className="h-3 w-3 text-[var(--draft)]" />
                  ) : (
                    <Check className="h-3 w-3 text-emerald-400" />
                  )}
                  {LABELS[key]}
                  {item.mode && <span className="font-normal text-[var(--text-3)]">— {item.mode}</span>}
                </div>
                <div className="text-[var(--text-2)]">{item.note}</div>
              </div>
            );
          })}

          {result.alignmentNotes.length > 0 && (
            <div className="rounded-md border border-accent/30 bg-accent/5 p-2">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                <AlertTriangle className="h-2.5 w-2.5" /> Story Profile alignment
              </div>
              <ul className="space-y-1">
                {result.alignmentNotes.map((n, i) => (
                  <li key={i} className="text-[11px] text-[var(--text-2)]">• {n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
