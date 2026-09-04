"use client";

import { useState } from "react";
import { AlertCircle, X, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * AiErrorBanner — prominent red bar shown when an AI call fails.
 *
 * Surfaces:
 *   - Error title (e.g. "Invalid API key")
 *   - Short hint telling the user what to do
 *   - Optional CTA button (links to AI Studio / Router / Providers)
 *   - Retry button (re-runs the failed call if a handler is provided)
 *   - Dismiss button
 *
 * Designed to be sticky at the top of any AI chat surface so the user
 * actually notices it (the old in-line error was easy to miss).
 *
 * NOTE on "reset on new error": parent components should pass a `key`
 * prop derived from the error message+kind so that React remounts the
 * banner with a fresh `dismissed=false` state when a NEW error arrives.
 * ------------------------------------------------------------------ */

export type AiErrorInfo = {
  message: string;
  kind?: string; // missing_key | bad_key | rate_limited | quota_exceeded | model_not_found | network | unknown
  provider?: string; // "zai" | "gemini" | ...
};

const ERROR_META: Record<string, { title: string; hint: string; cta?: string; ctaHash?: string }> = {
  missing_key: {
    title: "Missing API key",
    hint: "This task is routed to a provider that needs an API key, but you haven't added one yet.",
    cta: "Add key in AI Studio",
    ctaHash: "#/b/__BOOK__/ai",
  },
  bad_key: {
    title: "Invalid API key",
    hint: "The provider rejected your API key. Re-save it — make sure you copied the full key without trailing spaces.",
    cta: "Fix key in AI Studio",
    ctaHash: "#/b/__BOOK__/ai",
  },
  rate_limited: {
    title: "Rate limited",
    hint: "You're sending requests too fast. Wait a moment and try again.",
  },
  quota_exceeded: {
    title: "Quota exceeded",
    hint: "You've hit the provider's daily/monthly limit. Wait for reset, upgrade, or switch models.",
    cta: "Open Router tab",
    ctaHash: "#/b/__BOOK__/ai",
  },
  model_not_found: {
    title: "Model not found",
    hint: "The model id you selected doesn't exist on this provider. Pick a different model in the Router tab.",
    cta: "Open Router tab",
    ctaHash: "#/b/__BOOK__/ai",
  },
  network: {
    title: "Network error",
    hint: "Couldn't reach the provider. Check your connection and try again.",
  },
  sdk_init_failed: {
    title: "Provider unavailable",
    hint: "The provider client failed to initialize. Try again, or switch this task to a different model in the Router tab.",
    cta: "Open Router tab",
    ctaHash: "#/b/__BOOK__/ai",
  },
  unknown: {
    title: "AI call failed",
    hint: "An unexpected error occurred. Try again, or check AI Studio → Providers.",
    cta: "Open AI Studio",
    ctaHash: "#/b/__BOOK__/ai",
  },
};

const PROVIDER_LABELS: Record<string, string> = {
  zai: "Z.ai GLM",
  gemini: "Google Gemini",
};

export function AiErrorBanner({
  error,
  bookId,
  onRetry,
  onDismiss,
  className,
}: {
  error: AiErrorInfo;
  bookId?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const meta = ERROR_META[error.kind ?? "unknown"] ?? ERROR_META.unknown;
  const providerLabel = error.provider ? PROVIDER_LABELS[error.provider] ?? error.provider : null;

  // Build the CTA href — if we know the bookId, jump to that book's AI Studio.
  let ctaHref: string | null = null;
  if (meta.ctaHash && bookId) {
    ctaHref = meta.ctaHash.replace("__BOOK__", bookId);
  }

  return (
    <div
      role="alert"
      className={cn(
        "shrink-0 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-rose-300">{meta.title}</span>
            {providerLabel && (
              <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-medium text-rose-200">
                {providerLabel}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-rose-200/90">
            {meta.hint}
          </p>
          {/* Show the raw error message in a collapsed detail for debugging */}
          {error.message && error.message !== meta.hint && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[10px] text-rose-300/70 hover:text-rose-200">
                Show error detail
              </summary>
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-rose-500/10 p-1.5 text-[10px] text-rose-200/80">
                {error.message}
              </pre>
            </details>
          )}
          <div className="mt-2 flex items-center gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-200 hover:bg-rose-500/20"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            )}
            {ctaHref && (
              <a
                href={ctaHref}
                className="flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-200 hover:bg-rose-500/20"
              >
                {meta.cta} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-md p-1 text-rose-300/70 hover:bg-rose-500/20 hover:text-rose-200"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
