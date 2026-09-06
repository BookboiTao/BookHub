/* ------------------------------------------------------------------ *
 * halpe-client.ts — bridge to the HALPE Core engine (a separate repo,
 * mini-services/bookend-core, a Fastify service exposing a real
 * linguistic perception engine over HTTP on port 8787).
 *
 * This is the third tier the earlier constitution/guard rework was
 * missing on purpose: guard.ts explicitly declines to fake rules 32
 * (comma splices) and 34 (dangling modifiers) with regex, because a
 * naive heuristic would over-flag defensible prose. Real grammar
 * parsing is what those need — that's what this calls.
 *
 * HALPE has not been deployed anywhere as of writing this, so this
 * client is written against its real, actually-read HTTP contract
 * (POST /v1/perceive returns FrameworkPerception[] — id, domainId,
 * senseId, severity, description, optional span/target/proposedRepairs)
 * but is entirely INERT until HALPE_SERVICE_URL is set:
 *   - Unset -> checkGrammar() returns null immediately, no network call.
 *   - Set but unreachable/slow/erroring -> returns null within a short
 *     timeout, never throws. This is an optional enhancement layer;
 *     BookHub's core functionality must never depend on HALPE being up.
 *
 * To activate: deploy mini-services/bookend-core somewhere reachable
 * (it listens on $PORT, defaults to 8787) and set HALPE_SERVICE_URL
 * to that service's base URL (e.g. https://halpe.yourdomain.com).
 * ------------------------------------------------------------------ */

import type { Violation } from "./guard";

type HalpeSeverity = "info" | "low" | "medium" | "high" | "critical";

type FrameworkPerception = {
  id: string;
  domainId: string;
  senseId: string;
  severity: HalpeSeverity;
  description: string;
  span?: { start: number; end: number };
  target?: string;
  proposedRepairs?: { before: string; after: string; reason: string }[];
};

const TIMEOUT_MS = 4000;

function mapSeverity(s: HalpeSeverity): "error" | "warning" {
  return s === "critical" || s === "high" ? "error" : "warning";
}

function toViolation(p: FrameworkPerception, text: string): Violation {
  const quote = p.target ?? (p.span ? text.slice(p.span.start, p.span.end) : p.description);
  const repair = p.proposedRepairs?.[0];
  const suggestion = repair
    ? `Replace "${repair.before}" with "${repair.after}" — ${repair.reason}`
    : p.description;
  return {
    rule: `HALPE — ${p.senseId}`,
    severity: mapSeverity(p.severity),
    quote,
    suggestion,
  };
}

/**
 * Check text for real grammar/syntax issues via HALPE Core's perceive
 * endpoint. Returns null (not an empty array) when the feature isn't
 * configured or the call didn't succeed — callers should treat null
 * as "this tier isn't available right now", distinct from an empty
 * array meaning "checked, found nothing."
 */
export async function checkGrammar(text: string): Promise<Violation[] | null> {
  const baseUrl = process.env.HALPE_SERVICE_URL;
  if (!baseUrl || !text.trim()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/perceive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainId: "english", content: text }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { perceptions?: FrameworkPerception[] };
    if (!Array.isArray(data.perceptions)) return null;

    return data.perceptions.map((p) => toViolation(p, text));
  } catch {
    // Unreachable, timed out, malformed response — any of these just
    // mean "no grammar tier this time," never a user-facing error.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Whether HALPE is configured at all — lets callers skip even trying
 * (and lets the UI know not to show a "Grammar" section placeholder).
 */
export function isHalpeConfigured(): boolean {
  return Boolean(process.env.HALPE_SERVICE_URL);
}
