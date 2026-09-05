import { NextRequest, NextResponse } from "next/server";
import { requireUser, createSupabaseServer } from "@/lib/supabase-server";
import { callAI, providerForModel, MODEL_CATALOG, type ProviderKey } from "@/lib/ai/provider-clients";
import { buildBookContext, getAISettings, type Scope } from "@/lib/ai/context-builder";
import { checkProse } from "@/lib/ai/guard";
import { classifyAiError } from "@/lib/ai/provider-catalog";
import { z } from "zod";

const proposeSchema = z.object({
  bookId: z.string(),
  action: z.enum(["brainstorm_tab", "continue_chapter", "expand_card", "generate_summary", "contradiction_check", "extract_entities"]),
  scope: z.object({
    type: z.enum(["tab", "editor", "card", "overview"]),
    bookId: z.string(),
    tab: z.string().optional(),
    chapterId: z.string().optional(),
    cardId: z.string().optional(),
  }),
  extra: z.string().optional(),
});

const TASK_PROMPTS: Record<string, string> = {
  brainstorm_tab: "You are brainstorming new worldbuilding cards for this category. Generate 3-5 candidate cards. Each should have a title, a one-line summary, and a 1-2 sentence body. Format as JSON array: [{\"title\":\"...\",\"summary\":\"...\",\"body\":\"...\",\"tags\":[\"...\"]}]. Be creative but consistent with the existing world. Return ONLY the JSON array, no commentary.",
  continue_chapter: "Continue writing the next paragraph(s) of this chapter. Match the voice and style exactly. Write 2-4 paragraphs. Do not write chapter titles or meta-commentary — just the prose.",
  expand_card: "Expand this card with richer detail. Provide a revised summary (1 line) and an expanded body (3-5 sentences). Format as JSON: {\"title\":\"...\",\"summary\":\"...\",\"body\":\"...\"}. Return ONLY the JSON.",
  generate_summary: "Write a ~150 word world summary for this book based on the cards and content you can see. It should read as a pitch — what makes this world unique, what the central tensions are. Return only the summary text.",
  contradiction_check: "Check the world content for contradictions, inconsistencies, or canon violations. Return findings as JSON array: [{\"quote\":\"...\",\"issue\":\"...\",\"severity\":\"error\"|\"warning\",\"suggestion\":\"...\"}]. If no issues found, return empty array []. Be proportional — don't flag defensible plain statements. Return ONLY the JSON.",
  extract_entities: "Scan the workshop notes and conversation for structured worldbuilding entities that could become World Bible cards. Extract people (characters), places (geography), organizations (factions), magical systems, historical events, and creatures. Also detect relationships between the entities you extract. Return as JSON object: {\"entities\":[{\"title\":\"...\",\"summary\":\"...\",\"body\":\"...\",\"category\":\"magic|cosmology|geography|factions|history|bestiary|character\",\"tags\":[\"...\"]}],\"links\":[{\"from\":\"Entity Title A\",\"to\":\"Entity Title B\",\"label\":\"relationship type\"}]}. Only include entities with enough detail to warrant a card. Links reference entities by their title. Return ONLY the JSON object.",
};

/**
 * Loads the user's saved API keys for every provider that requires one.
 */
async function loadUserApiKeys(userId: string): Promise<Partial<Record<ProviderKey, string>>> {
  const supabase = await createSupabaseServer();
  const { data: rows } = await supabase
    .from("ai_provider_keys")
    .select("provider, api_key")
    .eq("user_id", userId);

  const keys: Partial<Record<ProviderKey, string>> = {};
  for (const r of rows ?? []) {
    if (r.api_key) {
      keys[r.provider as ProviderKey] = r.api_key;
    }
  }
  return keys;
}

export async function POST(req: NextRequest) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const body = await req.json().catch(() => null);
  const parsed = proposeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { bookId, action, scope: rawScope, extra } = parsed.data;

  const scope: Scope = {
    type: rawScope.type,
    bookId,
    ...(rawScope.tab ? { tab: rawScope.tab } : {}),
    ...(rawScope.chapterId ? { chapterId: rawScope.chapterId } : {}),
    ...(rawScope.cardId ? { cardId: rawScope.cardId } : {}),
  } as Scope;

  // Build context
  // Build context. Structured (JSON-only) actions skip the "you can't
  // create cards" chat reminder — see buildBookContext's doc comment.
  const structuredActions = new Set(["brainstorm_tab", "contradiction_check", "expand_card", "extract_entities"]);
  const ctx = await buildBookContext(scope, { structuredOutput: structuredActions.has(action) });

  // Build the task prompt
  const taskPrompt = TASK_PROMPTS[action] ?? "";
  const userMessage = extra
    ? `${taskPrompt}\n\nAdditional instruction from the writer: ${extra}`
    : taskPrompt;

  // Consult router for the model to use for this action
  const settings = await getAISettings(bookId);
  const router = (settings.router ?? {}) as Record<string, string>;
  const routerModel = router[action];

  // Load the user's saved API keys — needed for whichever provider the
  // router (or explicit request) selects.
  const apiKeys = await loadUserApiKeys(user.id);

  // If the router points to a provider that needs a key, validate it's present.
  if (routerModel) {
    const p = providerForModel(routerModel);
    if (MODEL_CATALOG[p].requiresApiKey && !apiKeys[p]) {
      return NextResponse.json(
        {
          error: `Router is set to use ${MODEL_CATALOG[p].label} for this task, but you haven't added an API key yet. Visit AI Studio → Providers to add one.`,
          error_kind: "missing_key",
          provider: p,
        },
        { status: 400 },
      );
    }
  }

  // Call the AI
  let response;
  try {
    response = await callAI(
      {
        system: ctx.system,
        messages: [{ role: "user", content: userMessage }],
        temperature: action === "continue_chapter" ? 0.8 : 0.6,
        maxTokens: action === "brainstorm_tab" ? 2000 : 1500,
      },
      { model: routerModel, apiKeys },
    );
  } catch (err) {
    // Classify the error so the frontend can show the right recovery hint.
    const info = classifyAiError(err);
    return NextResponse.json(
      {
        error: info.message,
        error_kind: info.kind,
        provider: info.provider ?? (routerModel ? providerForModel(routerModel) : "zai"),
      },
      { status: 500 },
    );
  }

  // Run guard on prose output (skip for structured JSON outputs)
  const guardViolations = action === "continue_chapter" ? checkProse(response.text) : [];

  // Parse structured responses
  let structured: unknown = undefined;
  const OBJECT_ACTIONS = new Set(["expand_card", "extract_entities"]); // model returns {...}
  const ARRAY_ACTIONS = new Set(["brainstorm_tab", "contradiction_check"]); // model returns [...]
  if (OBJECT_ACTIONS.has(action) || ARRAY_ACTIONS.has(action)) {
    try {
      // Extract JSON from the response (handles ```json fences and any
      // leading/trailing commentary the model adds). Match the bracket type
      // the action actually returns instead of a generic [...]|{...} guess —
      // extract_entities/expand_card return an object, whose own "[...]"
      // array fields would otherwise win a generic match if the model
      // prefixes its reply with any stray "[" before the real JSON.
      const pattern = OBJECT_ACTIONS.has(action) ? /\{[\s\S]*\}/ : /\[[\s\S]*\]/;
      const jsonMatch = response.text.match(pattern);
      if (jsonMatch) {
        structured = JSON.parse(jsonMatch[0]);
      }
    } catch {
      structured = undefined;
    }
  }

  // Log usage
  const supabase = await createSupabaseServer();
  await supabase.from("ai_usage").insert({
    book_id: bookId,
    user_id: user.id,
    provider: response.provider,
    model: response.model,
    task: action,
    tokens: response.usage?.totalTokens ?? 0,
  }).then(() => {});

  return NextResponse.json({
    text: response.text,
    structured,
    meta: {
      provider: response.provider,
      model: response.model,
      usage: response.usage,
      contextLayers: ctx.contextLayers,
    },
    guard: guardViolations.length > 0 ? guardViolations : undefined,
  });
}
