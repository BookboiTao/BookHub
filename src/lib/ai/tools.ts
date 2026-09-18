/* ------------------------------------------------------------------ *
 * tools.ts — tool/function-calling schemas for the AI chat agent loop.
 *
 * Two kinds, and the split matters:
 *   READ_TOOLS  — search_bible, get_card. Safe, non-destructive. The
 *                 server executes these immediately inside the loop so
 *                 the model can use the result to keep reasoning in the
 *                 same turn (e.g. search for a character, then read
 *                 their full card, then answer a question about them).
 *   WRITE_TOOLS — create_card, update_card, create_link. NEVER executed
 *                 server-side. A write tool call ends the loop and comes
 *                 back to the client as a "pending action" — the same
 *                 propose-then-approve shape every other AI feature in
 *                 this app already uses (Constitution, Story Profile,
 *                 brainstorm cards). The model can request a write, but
 *                 only the person clicking "Apply" ever makes it real.
 *
 * Schema shape here is intentionally provider-neutral (plain JSON
 * Schema-ish objects) — provider-clients.ts converts to each provider's
 * actual wire format (OpenAI-style for Z.ai, functionDeclarations for
 * Gemini) right before the request goes out.
 * ------------------------------------------------------------------ */

export type ToolParam = {
  type: "string" | "number" | "boolean" | "array";
  description: string;
  enum?: string[];
  items?: { type: string };
};

export type ToolDef = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParam>;
    required: string[];
  };
  /** true = executed immediately server-side; false = proposed for approval */
  readOnly: boolean;
};

const CATEGORY_ENUM = ["magic", "cosmology", "geography", "factions", "history", "bestiary", "character"];

export const TOOLS: ToolDef[] = [
  {
    name: "search_bible",
    description: "Search the book's World Bible (all lore cards and characters) by title or summary text. Use this before answering any question about a specific character, place, faction, or concept, and before proposing a create_card or create_link so you know what already exists and don't duplicate it.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for in card titles and summaries" },
        category: { type: "string", description: "Optional: limit to one category", enum: CATEGORY_ENUM },
      },
      required: ["query"],
    },
    readOnly: true,
  },
  {
    name: "get_card",
    description: "Fetch the full detail of one World Bible card by its id (title, summary, full body, tags, facts/fields, canon status). Use this after search_bible finds a candidate and you need its full content, not just the summary.",
    parameters: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The card's id, from a search_bible result" },
      },
      required: ["cardId"],
    },
    readOnly: true,
  },
  {
    name: "create_card",
    description: "Propose a new World Bible article. This does NOT create it immediately — it queues a proposal the person must explicitly approve. Always search_bible first to check something similar doesn't already exist.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Which World Bible tab this belongs in", enum: CATEGORY_ENUM },
        title: { type: "string", description: "Article title" },
        summary: { type: "string", description: "One-line summary" },
        body: { type: "string", description: "The article body" },
        tags: { type: "array", description: "Short tag words", items: { type: "string" } },
      },
      required: ["category", "title"],
    },
    readOnly: false,
  },
  {
    name: "update_card",
    description: "Propose an edit to an existing World Bible article. This does NOT apply immediately — it queues a proposal the person must explicitly approve. Only include fields you actually want to change; omitted fields stay as they are.",
    parameters: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "The card's id, from a search_bible or get_card result" },
        title: { type: "string", description: "New title, if changing" },
        summary: { type: "string", description: "New summary, if changing" },
        body: { type: "string", description: "New body, if changing" },
      },
      required: ["cardId"],
    },
    readOnly: false,
  },
  {
    name: "create_link",
    description: "Propose a connection between two existing World Bible cards (a 'See also' link). This does NOT apply immediately — it queues a proposal the person must explicitly approve. Both cards must already exist — use search_bible or get_card to find their ids first; never invent an id.",
    parameters: {
      type: "object",
      properties: {
        fromCardId: { type: "string", description: "The source card's id" },
        toCardId: { type: "string", description: "The target card's id" },
        label: { type: "string", description: "Optional relationship label, e.g. 'hunts', 'caused'" },
      },
      required: ["fromCardId", "toCardId"],
    },
    readOnly: false,
  },
];

export const READ_TOOL_NAMES = new Set(TOOLS.filter((t) => t.readOnly).map((t) => t.name));
export const WRITE_TOOL_NAMES = new Set(TOOLS.filter((t) => !t.readOnly).map((t) => t.name));

export function isReadTool(name: string): boolean {
  return READ_TOOL_NAMES.has(name);
}
export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name);
}
