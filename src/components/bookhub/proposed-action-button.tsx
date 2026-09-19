"use client";

/* ------------------------------------------------------------------ *
 * ApplyButton + NotSavedYetHint — the two small, shared pieces every
 * "AI proposed something" surface uses, so the verb, the states, and
 * the trust signal ("this hasn't happened yet") read the same whether
 * you're looking at Workshop's extraction grid, the AI dock's
 * brainstorm results, or a tool-calling proposal card. Each surface
 * keeps its own outer layout (grid card, chat bubble, whatever fits) —
 * only the button and the hint are shared, on purpose, so this doesn't
 * force one visual shape onto contexts that shouldn't share one.
 * ------------------------------------------------------------------ */

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { applyProposedAction, type ProposedAction } from "@/lib/ai/proposed-actions";

export function NotSavedYetHint() {
  return (
    <span className="text-[10px] text-[var(--text-3)]">
      Not saved yet — tap Apply
    </span>
  );
}

/** A single-field before/after diff line — the real "here's what will
 * actually change" view for an update_card proposal, instead of applying
 * an edit blind. Truncates long values so one changed field doesn't
 * swallow the whole card. */
export function FieldDiff({ label, oldValue, newValue }: { label: string; oldValue: string; newValue: string }) {
  const truncate = (s: string) => (s.length > 140 ? `${s.slice(0, 140)}…` : s);
  return (
    <div className="text-[10px]">
      <div className="mb-0.5 font-medium uppercase tracking-wide text-[var(--text-3)]">{label}</div>
      <div className="flex gap-1.5">
        <span className="shrink-0 font-mono text-red-400">−</span>
        <span className="text-[var(--text-2)] line-through decoration-red-400/50">{truncate(oldValue) || "(empty)"}</span>
      </div>
      <div className="flex gap-1.5">
        <span className="shrink-0 font-mono text-emerald-400">+</span>
        <span className="text-foreground">{truncate(newValue) || "(empty)"}</span>
      </div>
    </div>
  );
}

export function ApplyButton({
  bookId,
  action,
  onApplied,
  onError,
  label = "Apply",
}: {
  bookId: string;
  action: ProposedAction;
  /** Called once, after a successful apply — use this to remove the
   * proposal from whatever list is showing it. Receives the new
   * resource's id when the action created one (create_card). */
  onApplied: (id?: string) => void;
  onError: (message: string) => void;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "applying" | "applied">("idle");

  if (state === "applied") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-400">
        <Check className="h-3 w-3" /> Applied
      </span>
    );
  }

  return (
    <button
      onClick={async () => {
        setState("applying");
        const result = await applyProposedAction(bookId, action);
        if (result.ok) {
          setState("applied");
          onApplied(result.id);
        } else {
          setState("idle");
          onError(result.error);
        }
      }}
      disabled={state === "applying"}
      className="flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[10px] font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
    >
      {state === "applying" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
      {state === "applying" ? "Applying…" : label}
    </button>
  );
}
