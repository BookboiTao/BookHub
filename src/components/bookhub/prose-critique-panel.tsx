"use client";

import { useState } from "react";
import { Sparkles, Loader2, ShieldCheck, Wand2 } from "lucide-react";
import { AiErrorBanner, type AiErrorInfo } from "@/components/bookhub/ai-error-banner";

/* ------------------------------------------------------------------ *
 * ProseCritiquePanel — the manual "check my own prose" tool.
 *
 * guard.ts's own header comment claims checkProse is "available as a
 * button in the editor Tools tab" — until this component, it wasn't:
 * checkProse only ever ran automatically on AI-generated text. This is
 * the first place a writer can run the constitution against their OWN
 * typed prose, on demand.
 *
 * Two passes, shown separately on purpose:
 *   - "Mechanical" = guard.ts's code-enforced rules, run instantly,
 *     deterministic, no AI call.
 *   - "AI critique" = the model applying the full constitution as a
 *     rubric (rules 28-31 govern ITS behavior while critiquing:
 *     proportional fixes, no invented details, no over-flagging).
 * Kept separate rather than merged so it's visible which findings are
 * deterministic and which are judgment calls — never auto-applied,
 * this only ever surfaces findings for the writer to act on or ignore.
 * ------------------------------------------------------------------ */

type Finding = { rule: string; severity: "error" | "warning"; quote: string; suggestion: string };

export function ProseCritiquePanel({
  bookId,
  chapterId,
  text,
}: {
  bookId: string;
  chapterId: string;
  text: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiErrorInfo | null>(null);
  const [guardFindings, setGuardFindings] = useState<Finding[] | null>(null);
  const [aiFindings, setAiFindings] = useState<Finding[] | null>(null);
  const [ranOnce, setRanOnce] = useState(false);

  async function handleCheck() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          action: "critique_prose",
          scope: { type: "editor", bookId, chapterId },
          extra: text,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setGuardFindings(Array.isArray(data.guard) ? data.guard : []);
      setAiFindings(Array.isArray(data.structured) ? data.structured : []);
      setRanOnce(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError({ message: msg, kind: undefined });
    } finally {
      setLoading(false);
    }
  }

  const totalFindings = (guardFindings?.length ?? 0) + (aiFindings?.length ?? 0);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <span className="text-xs font-semibold">Check my prose</span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-2)]">
        Runs your own draft against the Constitution — mechanical checks instantly, plus an AI critique pass. Read-only findings; nothing here edits your text.
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
        disabled={!text.trim() || loading}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-40"
      >
        {loading ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Checking…
          </>
        ) : (
          <>
            <Wand2 className="h-3 w-3" /> Check my prose
          </>
        )}
      </button>

      {ranOnce && !loading && (
        <div className="mt-3 space-y-3">
          {totalFindings === 0 ? (
            <p className="text-[11px] text-[var(--text-2)]">No issues found — clean pass.</p>
          ) : (
            <>
              <FindingGroup
                icon={<ShieldCheck className="h-3 w-3" />}
                label="Mechanical"
                hint="deterministic, no AI call"
                findings={guardFindings ?? []}
              />
              <FindingGroup
                icon={<Sparkles className="h-3 w-3" />}
                label="AI critique"
                hint="judgment calls, rules 28-31"
                findings={aiFindings ?? []}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FindingGroup({
  icon,
  label,
  hint,
  findings,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  findings: Finding[];
}) {
  if (findings.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        {icon}
        {label}
        <span className="font-normal normal-case text-[var(--text-3)]">— {hint}</span>
      </div>
      <div className="space-y-1.5">
        {findings.map((f, i) => (
          <div
            key={i}
            className={
              "rounded-md border p-2 text-[11px] " +
              (f.severity === "error"
                ? "border-red-500/30 bg-red-500/5"
                : "border-border bg-[var(--surface-2)]")
            }
          >
            <div className="mb-0.5 font-medium text-foreground">{f.rule}</div>
            <div className="mb-1 text-[var(--text-2)]">"{f.quote}"</div>
            <div className="text-[var(--text-3)]">{f.suggestion}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
