"use client";

import { useMemo, useState } from "react";
import { RefreshCw, X, AlertTriangle, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Crutch-word / repetition finder
 *
 * Runs on the textarea content directly. Finds:
 *   1. Crutch words (overused filler: just, really, very, that, etc.)
 *   2. Repeated words (same word 3+ times)
 *   3. Repeated sentence starters (consecutive sentences starting same)
 * ------------------------------------------------------------------ */

const CRUTCH_WORDS = [
  "just", "really", "very", "that", "then", "actually", "basically",
  "literally", "somehow", "something", "somehow", "quite", "rather",
  "perhaps", "maybe", "sort of", "kind of", "a bit", "a little",
  "suddenly", "immediately", "quickly", "slowly", "quietly",
];

type Finding = {
  type: "crutch" | "repeated" | "starter";
  word: string;
  count: number;
  severity: "low" | "medium" | "high";
  message: string;
};

function analyzeText(text: string): Finding[] {
  const findings: Finding[] = [];
  if (!text.trim()) return findings;

  const lower = text.toLowerCase();
  const words = lower.match(/\b[a-z']+\b/g) ?? [];
  const wordCount = new Map<string, number>();

  for (const w of words) {
    wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
  }

  // 1. crutch words
  for (const crutch of CRUTCH_WORDS) {
    const count = wordCount.get(crutch) ?? 0;
    if (count >= 2) {
      findings.push({
        type: "crutch",
        word: crutch,
        count,
        severity: count >= 5 ? "high" : count >= 3 ? "medium" : "low",
        message: `"${crutch}" appears ${count}× — consider cutting some`,
      });
    }
  }

  // 2. repeated words (non-crutch, 4+ times)
  for (const [word, count] of wordCount) {
    if (count >= 4 && !CRUTCH_WORDS.includes(word) && word.length > 3) {
      findings.push({
        type: "repeated",
        word,
        count,
        severity: count >= 8 ? "high" : count >= 6 ? "medium" : "low",
        message: `"${word}" appears ${count}× — check if it's echoing`,
      });
    }
  }

  // 3. repeated sentence starters
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  const starters = sentences.map((s) => {
    const m = s.trim().match(/^(\w+)/);
    return m?.[1]?.toLowerCase() ?? "";
  });
  for (let i = 0; i < starters.length - 2; i++) {
    if (
      starters[i] &&
      starters[i] === starters[i + 1] &&
      starters[i] === starters[i + 2]
    ) {
      findings.push({
        type: "starter",
        word: starters[i],
        count: 3,
        severity: "medium",
        message: `Three sentences in a row start with "${starters[i]}"`,
      });
      i += 2; // skip ahead
    }
  }

  return findings.sort((a, b) => {
    const sevOrder = { high: 0, medium: 1, low: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });
}

const SEVERITY_STYLES = {
  high: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  low: "border-border bg-muted text-muted-foreground",
};

const TYPE_ICONS = {
  crutch: AlertTriangle,
  repeated: Repeat,
  starter: AlertTriangle,
};

export function CrutchWordPanel({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const findings = useMemo(() => analyzeText(text), [text, refreshKey]);

  const totalWords = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="absolute right-0 top-12 z-30 w-80 rounded-xl border border-border bg-popover shadow-2xl">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-semibold">Repetition finder</span>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Re-analyze"
          aria-label="Re-analyze"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* summary */}
      <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
        {totalWords.toLocaleString()} words analyzed ·{" "}
        {findings.length === 0 ? (
          <span className="text-emerald-400">clean — no repetition found</span>
        ) : (
          <span className="text-amber-400">
            {findings.length} {findings.length === 1 ? "flag" : "flags"}
          </span>
        )}
      </div>

      {/* findings */}
      <div className="bh-scroll max-h-72 space-y-1.5 overflow-y-auto p-2">
        {findings.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            No crutch words or repetition detected. Keep writing.
          </div>
        ) : (
          findings.map((f, i) => {
            const Icon = TYPE_ICONS[f.type];
            return (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-2.5 py-1.5",
                  SEVERITY_STYLES[f.severity],
                )}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">{f.message}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* footer */}
      <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
        Runs locally on your text. Nothing sent anywhere.
      </div>
    </div>
  );
}
