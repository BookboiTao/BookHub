/* ------------------------------------------------------------------ *
 * context-builder.ts — THE ASSEMBLER.
 * 
 * The ONLY way AI sees the workshop. Assembles layered context from
 * the database, respecting budget (~24k chars total).
 *
 * Layers:
 *   0: System prompt = Constitution (active rules) + Fingerprint (voice/pacing/tone)
 *   1: World summary (books.world_summary_body)
 *   2: Scope-dependent slices:
 *      - tab: cards in that category (canon only, title+summary+body)
 *      - editor: Chapter State N-1 + last ~1500 words of prose + character sheets
 *      - card: that card full + its linked cards (one hop)
 *      - glossary: all glossary terms (term — definition)
 * ------------------------------------------------------------------ */

import { createSupabaseServer } from "@/lib/supabase-server";

const MAX_CONTEXT_CHARS = 24000;

export type Scope =
  | { type: "tab"; bookId: string; tab: string }
  | { type: "editor"; bookId: string; chapterId: string }
  | { type: "card"; bookId: string; cardId: string }
  | { type: "overview"; bookId: string };

export type AssembledContext = {
  system: string;
  contextLayers: string[];
  totalChars: number;
};

// --- Constitution seed (shown as editable draft on first open) ---
export const CONSTITUTION_SEED = [
  { id: "rule-1", text: "Zero em-dashes anywhere in generated prose.", enforcement: "code" as const, active: true },
  { id: "rule-2", text: "Avoid the Three Mistakes: over-explaining everything, giving life to things unnecessarily, writing the right words in the wrong way.", enforcement: "prompt" as const, active: true },
  { id: "rule-3", text: "No reflexive 'suddenly', no 'seemed to' hedges without real uncertainty, no 'something shifted' vagueness — if something changes, name what.", enforcement: "code" as const, active: true },
  { id: "rule-4", text: "No generic emotion catalog (jaw tightening, eyes narrowing) — reach for the specific, causal detail instead.", enforcement: "prompt" as const, active: true },
  { id: "rule-5", text: "No unearned personification of objects or settings; no stacked metaphors on one image.", enforcement: "prompt" as const, active: true },
  { id: "rule-6", text: "Chapter ends: a small open pull, never an announced hook.", enforcement: "prompt" as const, active: true },
  { id: "rule-7", text: "Let scenes breathe — silence is allowed.", enforcement: "prompt" as const, active: true },
  { id: "rule-8", text: "Don't editorialize causal connections between juxtaposed scenes.", enforcement: "prompt" as const, active: true },
  { id: "rule-9", text: "AI critiques must be proportional (no rewrite for a comma), must not introduce new tells while fixing one, must not invent details absent from the passage.", enforcement: "prompt" as const, active: true },
];

export const FINGERPRINT_SEED = {
  voice: "",
  pacing: "",
  tone: "",
  samples: [] as { id: string; label: string; text: string }[],
};

/**
 * Get AI settings for a book from the database.
 * Falls back to seed content if no settings exist yet.
 */
export async function getAISettings(bookId: string) {
  const supabase = await createSupabaseServer();

  const { data: book } = await supabase
    .from("books")
    .select("id, title")
    .eq("id", bookId)
    .maybeSingle();

  // Try to fetch from an ai_settings table if it exists
  const { data: settings } = await supabase
    .from("ai_settings")
    .select("constitution, fingerprint, router")
    .eq("book_id", bookId)
    .maybeSingle();

  return {
    book,
    constitution: (settings?.constitution as typeof CONSTITUTION_SEED) ?? CONSTITUTION_SEED,
    fingerprint: (settings?.fingerprint as typeof FINGERPRINT_SEED) ?? FINGERPRINT_SEED,
    router: (settings?.router as Record<string, string>) ?? {},
  };
}

/**
 * Build the complete context for an AI call.
 * This is the ONLY entry point — no AI call may bypass it.
 */
export async function buildBookContext(scope: Scope): Promise<AssembledContext> {
  const supabase = await createSupabaseServer();
  const layers: string[] = [];
  let totalChars = 0;

  // --- Layer 0: System prompt (constitution + fingerprint + glossary) ---
  const settings = await getAISettings(scope.bookId);
  
  const activeRules = settings.constitution.filter((r: { active: boolean }) => r.active);
  const rulesText = activeRules.length > 0
    ? `CONSTITUTION (must follow):\n${activeRules.map((r: { text: string }, i: number) => `${i + 1}. ${r.text}`).join("\n")}`
    : "";

  const fp = settings.fingerprint;
  let fingerprintText = "";
  if (fp?.voice || fp?.pacing || fp?.tone) {
    fingerprintText = `FINGERPRINT:\n${fp.voice ? `Voice: ${fp.voice}\n` : ""}${fp.pacing ? `Pacing: ${fp.pacing}\n` : ""}${fp.tone ? `Tone: ${fp.tone}` : ""}`;
  }

  // Glossary terms
  const { data: glossary } = await supabase
    .from("glossary_terms")
    .select("term, definition")
    .eq("book_id", scope.bookId);

  let glossaryText = "";
  if (glossary && glossary.length > 0) {
    glossaryText = `GLOSSARY:\n${glossary.map((g: { term: string; definition: string }) => `- ${g.term}: ${g.definition || "(no definition yet)"}`).join("\n")}`;
  }

  const systemPrompt = [
    "You are BookHub AI — a writing assistant for a novelist. You help with brainstorming, drafting, worldbuilding, and checking consistency. You are not a generic AI — you are embedded in the writer's own workspace and can see their world.",
    rulesText,
    fingerprintText,
    glossaryText,
  ].filter(Boolean).join("\n\n");

  layers.push("System: constitution + fingerprint + glossary");
  totalChars += systemPrompt.length;

  // --- Layer 1: World summary ---
  const { data: book } = await supabase
    .from("books")
    .select("title, world_summary_title, world_summary_body, blurb, genre")
    .eq("id", scope.bookId)
    .maybeSingle();

  let worldSummary = "";
  if (book) {
    worldSummary = `BOOK: ${book.title}\nGenre: ${book.genre || "unspecified"}\n`;
    if (book.world_summary_body) {
      worldSummary += `World summary: ${book.world_summary_body}\n`;
    } else if (book.blurb) {
      worldSummary += `Blurb: ${book.blurb}\n`;
    }
  }
  layers.push("World summary");
  totalChars += worldSummary.length;

  // --- Layer 2: Scope-dependent slices ---
  let scopeContext = "";

  if (scope.type === "tab") {
    // Cards in that category (canon first, then draft)
    const { data: cards } = await supabase
      .from("cards")
      .select("title, summary, body, canon_status, tags")
      .eq("book_id", scope.bookId)
      .eq("category", scope.tab)
      .order("canon_status", { ascending: false });

    if (cards && cards.length > 0) {
      const cardTexts = cards.map((c: { title: string; summary: string; body: string; canon_status: string; tags: string[] }) => {
        const status = c.canon_status === "canon" ? "[CANON]" : "[DRAFT]";
        const tags = c.tags?.length ? ` (${c.tags.join(", ")})` : "";
        return `${status} ${c.title}${tags}\n${c.summary || ""}\n${c.body || ""}`;
      });
      scopeContext = `CARDS IN ${scope.tab.toUpperCase()}:\n${cardTexts.join("\n\n---\n\n")}`;
    }
  } else if (scope.type === "editor") {
    // Chapter content + state + character mentions
    const { data: chapter } = await supabase
      .from("chapters")
      .select("title, content, sort_order")
      .eq("id", scope.chapterId)
      .maybeSingle();

    if (chapter) {
      const prose = chapter.content || "";
      const lastWords = prose.length > 1500 ? prose.slice(-1500) : prose;
      scopeContext = `CURRENT CHAPTER: Ch.${(chapter.sort_order ?? 0) + 1} — ${chapter.title}\n\nLast ~1500 chars of prose:\n${lastWords}\n`;
    }

    // Chapter state (the previous chapter's state, if any)
    const { data: states } = await supabase
      .from("chapter_states")
      .select("state, notes, chapter_id")
      .eq("book_id", scope.bookId);

    if (states && states.length > 0) {
      const latestState = states[states.length - 1];
      scopeContext += `\nLATEST CHAPTER STATE:\n${JSON.stringify(latestState.state, null, 2)}\n`;
      if (latestState.notes) scopeContext += `Notes: ${latestState.notes}\n`;
    }

    // Character sheets for @mentioned characters
    const { data: characters } = await supabase
      .from("cards")
      .select("title, summary, fields, character_data")
      .eq("book_id", scope.bookId)
      .eq("category", "character");

    if (characters && characters.length > 0) {
      const charTexts = characters.map((c: { title: string; summary: string; fields: { label: string; value: string }[] }) => {
        const role = c.fields?.find((f: { label: string }) => f.label === "Role")?.value;
        const voice = c.fields?.find((f: { label: string }) => f.label === "Voice")?.value;
        return `- ${c.title}${role ? ` (${role})` : ""}${voice ? ` — voice: ${voice}` : ""}: ${c.summary || ""}`;
      });
      scopeContext += `\nCHARACTERS:\n${charTexts.join("\n")}`;
    }
  } else if (scope.type === "card") {
    // Single card + its linked cards (one hop)
    const { data: card } = await supabase
      .from("cards")
      .select("*")
      .eq("id", scope.cardId)
      .maybeSingle();

    if (card) {
      scopeContext = `FOCUS CARD:\nTitle: ${card.title}\nSummary: ${card.summary || ""}\nBody: ${card.body || ""}\nStatus: ${card.canon_status}\nTags: ${card.tags?.join(", ") || "none"}\nFields: ${JSON.stringify(card.fields)}\n`;

      // One-hop linked cards
      const { data: links } = await supabase
        .from("card_links")
        .select("from_card_id, to_card_id, label")
        .or(`from_card_id.eq.${scope.cardId},to_card_id.eq.${scope.cardId}`);

      if (links && links.length > 0) {
        const linkedIds = new Set<string>();
        for (const l of links) {
          if (l.from_card_id === scope.cardId) linkedIds.add(l.to_card_id);
          if (l.to_card_id === scope.cardId) linkedIds.add(l.from_card_id);
        }
        const { data: linkedCards } = await supabase
          .from("cards")
          .select("title, summary, category")
          .in("id", [...linkedIds]);

        if (linkedCards && linkedCards.length > 0) {
          scopeContext += `\nLINKED CARDS:\n${linkedCards.map((c: { title: string; summary: string; category: string }) => `- ${c.title} [${c.category}]: ${c.summary || ""}`).join("\n")}`;
        }
      }
    }
  } else if (scope.type === "overview") {
    // Overview scope — all cards (title + summary only, no bodies)
    const { data: allCards } = await supabase
      .from("cards")
      .select("title, summary, category, canon_status")
      .eq("book_id", scope.bookId);

    if (allCards && allCards.length > 0) {
      const byCategory: Record<string, typeof allCards> = {};
      for (const c of allCards) {
        if (!byCategory[c.category]) byCategory[c.category] = [];
        byCategory[c.category].push(c);
      }
      const sections = Object.entries(byCategory).map(([cat, cards]) => {
        return `${cat.toUpperCase()}:\n${cards.map((c: { canon_status: string; title: string; summary: string }) => `- [${c.canon_status}] ${c.title}: ${c.summary || ""}`).join("\n")}`;
      });
      scopeContext = `ALL CARDS (overview):\n${sections.join("\n\n")}`;
    }
  }

  layers.push(`Scope: ${scope.type}`);
  totalChars += scopeContext.length;

  // --- Budget management: truncate if over limit ---
  if (totalChars > MAX_CONTEXT_CHARS) {
    // Drop card bodies to summaries if over budget
    scopeContext = scopeContext.slice(0, MAX_CONTEXT_CHARS - systemPrompt.length - worldSummary.length - 500);
    layers.push("(truncated to budget)");
    totalChars = systemPrompt.length + worldSummary.length + scopeContext.length;
  }

  return {
    system: systemPrompt,
    contextLayers: layers,
    totalChars,
  };
}

/**
 * Convenience: build the full messages array for an AI call.
 */
export async function buildMessages(
  scope: Scope,
  userMessages: { role: "user" | "assistant"; content: string }[],
): Promise<{ system: string; messages: { role: "system" | "user" | "assistant"; content: string }[]; contextLayers: string[] }> {
  const ctx = await buildBookContext(scope);
  const messages = [
    ...userMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  // Prepend context as the first user message (after system prompt)
  const contextText = ctx.contextLayers.join(", ");
  messages.unshift({
    role: "user",
    content: `[CONTEXT — ${contextText}]\n\n${scope.type === "editor" ? "" : "Here is the relevant world data for our conversation:"}`,
  });

  return {
    system: ctx.system,
    messages,
    contextLayers: ctx.contextLayers,
  };
}
