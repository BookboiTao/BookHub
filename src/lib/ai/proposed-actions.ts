/* ------------------------------------------------------------------ *
 * proposed-actions.ts — the ONE apply codepath for every AI-proposed
 * World Bible write, wherever it's proposed from (Workshop's entity
 * extraction, the AI dock's brainstorm results, the tool-calling agent
 * loop's create_card/update_card/create_link). Before this, each of
 * those three places had its own hand-rolled fetch-and-apply logic —
 * same job, three slightly different implementations that could drift
 * out of sync with each other. Now there's one.
 * ------------------------------------------------------------------ */

export type ProposedAction =
  | { kind: "create_card"; category: string; title: string; summary?: string; body?: string; tags?: string[] }
  | { kind: "update_card"; cardId: string; title?: string; summary?: string; body?: string }
  | { kind: "create_link"; fromCardId: string; toCardId: string; label?: string };

export type ApplyResult = { ok: true; id?: string } | { ok: false; error: string };

/** Actually performs a proposed action against the real API. This is the
 * only place any "apply this proposal" button should call — never
 * duplicate this fetch logic at a call site. */
export async function applyProposedAction(bookId: string, action: ProposedAction): Promise<ApplyResult> {
  try {
    if (action.kind === "create_card") {
      const res = await fetch(`/api/books/${bookId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: action.category,
          title: action.title,
          summary: action.summary ?? "",
          body: action.body ?? "",
          canonStatus: "draft",
          tags: action.tags ?? [],
          fields: [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { ok: false, error: err.error ?? `HTTP ${res.status}` };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, id: data?.card?.id };
    }

    if (action.kind === "update_card") {
      const updates: Record<string, unknown> = {};
      if (action.title !== undefined) updates.title = action.title;
      if (action.summary !== undefined) updates.summary = action.summary;
      if (action.body !== undefined) updates.body = action.body;
      const res = await fetch(`/api/cards/${action.cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { ok: false, error: err.error ?? `HTTP ${res.status}` };
      }
      return { ok: true };
    }

    if (action.kind === "create_link") {
      const res = await fetch(`/api/books/${bookId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromCardId: action.fromCardId,
          toCardId: action.toCardId,
          label: action.label,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { ok: false, error: err.error ?? `HTTP ${res.status}` };
      }
      return { ok: true };
    }

    return { ok: false, error: "Unknown action type" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  magic: "Magic Systems", cosmology: "Cosmology", geography: "Geography",
  factions: "Factions", history: "History", bestiary: "Bestiary", character: "Cast",
};

/** One consistent description string for any proposed action, so the
 * wording is the same everywhere it's shown instead of each surface
 * inventing its own phrasing. */
export function describeProposedAction(action: ProposedAction): string {
  if (action.kind === "create_card") {
    return `Create "${action.title}" in ${CATEGORY_LABELS[action.category] ?? action.category}`;
  }
  if (action.kind === "update_card") {
    const changed = [action.title && "title", action.summary && "summary", action.body && "body"].filter(Boolean);
    return `Edit article${changed.length ? `: ${changed.join(", ")}` : ""}`;
  }
  if (action.kind === "create_link") {
    return `Link two articles${action.label ? ` (${action.label})` : ""}`;
  }
  return "Unknown action";
}
