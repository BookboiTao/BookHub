import { NextRequest, NextResponse } from "next/server";
import { requireUser, createSupabaseServer } from "@/lib/supabase-server";
import { callAI, resolveProvider, MODEL_CATALOG, type ProviderKey } from "@/lib/ai/provider-clients";
import { buildBookContext, getAISettings, type Scope } from "@/lib/ai/context-builder";
import { checkProse } from "@/lib/ai/guard";
import { checkGrammar } from "@/lib/ai/halpe-client";
import { classifyAiError } from "@/lib/ai/provider-catalog";
import { z } from "zod";

const proposeSchema = z.object({
  bookId: z.string(),
  action: z.enum(["brainstorm_tab", "continue_chapter", "expand_card", "generate_summary", "contradiction_check", "extract_entities", "critique_prose", "generate_story_profile"]),
  scope: z.object({
    type: z.enum(["tab", "editor", "card", "overview", "story_profile"]),
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
  critique_prose: "You are critiquing prose the writer drafted themselves — not writing anything. Apply the full constitution above as your rubric. While critiquing, you must follow these behavior rules exactly: (1) a fix must be proportional to the actual problem — a missing comma gets a comma, not a rewrite of the sentence's imagery; (2) a proposed fix must not introduce a new tell while resolving a different one; (3) a proposed fix must not invent new sensory or environmental details that are not already in the passage, however plausible-sounding; (4) before flagging anything, confirm it is an actual violation and not just a defensible plain statement — over-flagging erodes trust in the critique as a whole, so when genuinely uncertain, do not flag it. Return findings as a JSON array, one entry per real issue found: [{\"rule\":\"short label, e.g. 'Rule 7 — stacked metaphor'\",\"severity\":\"error\"|\"warning\",\"quote\":\"the exact phrase or sentence from the passage\",\"suggestion\":\"a specific, minimal, proportional fix\"}]. If the passage is genuinely clean, return an empty array []. Return ONLY the JSON array, no commentary before or after it.",
  generate_story_profile: "Read the chapters, story-event chronology, and characters you can see. Infer this story's Story Profile using this exact vocabulary: Structure (which shape: Three-act, Hero's Journey, Episodic, Nonlinear, Parallel/braided, Iterative/cyclical, etc. — name the closest fit) and a one-line note on roughly where the story is right now within that shape; Cast configuration (Single protagonist, Multiple protagonists/ensemble, Antagonist-centered, No central character, or Reciprocal) and castRoles mapping actual character names you saw to Greimas roles (subject/object/opponent/helper/sender/receiver — only include roles you have real evidence for, don't invent one for every slot); Change (is it External, Internal, or Both); resolutionMode (Resolved, Unresolved, Near-static, or Incomplete/ongoing — 'Incomplete/ongoing' is usually correct for a story still being written); centralConflict (one line — what makes the change non-trivial, not necessarily a villain); narrationMode (POV and focalization, e.g. 'Close third, single POV' or 'Omniscient, narrator-driven'); infoWithheld (what the reader currently doesn't know that matters). If there isn't enough written yet to infer a field with real confidence, leave it as an empty string rather than guessing — an honest blank is more useful than a plausible-sounding fabrication. Return ONLY this JSON object, no commentary: {\"structure\":\"...\",\"structureNote\":\"...\",\"castConfig\":\"...\",\"castRoles\":[{\"role\":\"subject\"|\"object\"|\"opponent\"|\"helper\"|\"sender\"|\"receiver\",\"name\":\"...\"}],\"changeMode\":\"...\",\"resolutionMode\":\"...\",\"centralConflict\":\"...\",\"narrationMode\":\"...\",\"infoWithheld\":\"...\"}",
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

  // Build context. Structured (JSON-only) actions skip the "you can't
  // create cards" chat reminder — see buildBookContext's doc comment.
  const structuredActions = new Set(["brainstorm_tab", "contradiction_check", "expand_card", "extract_entities", "critique_prose", "generate_story_profile"]);
  const ctx = await buildBookContext(scope, { structuredOutput: structuredActions.has(action) });

  // Build the task prompt. critique_prose's `extra` IS the prose being
  // critiqued, not a casual add-on instruction — label it accordingly so
  // the model doesn't confuse "critique this" with "here's a stylistic note".
  const taskPrompt = TASK_PROMPTS[action] ?? "";
  const userMessage =
    action === "critique_prose"
      ? `${taskPrompt}\n\nPROSE TO CRITIQUE:\n${extra ?? ""}`
      : extra
        ? `${taskPrompt}\n\nAdditional instruction from the writer: ${extra}`
        : taskPrompt;

  // Consult router for the model to use for this action
  const settings = await getAISettings(bookId);
  const router = (settings.router ?? {}) as Record<string, string>;
  const routerModel = router[action];

  // Load the user's saved API keys — needed for whichever provider the
  // router (or explicit request) selects.
  const apiKeys = await loadUserApiKeys(user.id);

  // Resolve which provider/model this call actually uses. Falls back to
  // whichever provider the user has a key for when nothing is routed —
  // see resolveProvider's doc comment for why that matters here specifically.
  const { model: resolvedModel, provider: resolvedProvider } = resolveProvider(routerModel, apiKeys);
  if (MODEL_CATALOG[resolvedProvider].requiresApiKey && !apiKeys[resolvedProvider]) {
    return NextResponse.json(
      {
        error: routerModel
          ? `Router is set to use ${MODEL_CATALOG[resolvedProvider].label} for this task, but you haven't added an API key yet. Visit AI Studio → Providers to add one.`
          : `This needs an AI provider set up first. Visit AI Studio → Providers and add a free API key (Z.ai or Gemini).`,
        error_kind: "missing_key",
        provider: resolvedProvider,
      },
      { status: 400 },
    );
  }

  // Call the AI
  let response;
  try {
    response = await callAI(
      {
        system: ctx.system,
        messages: [{ role: "user", content: userMessage }],
        temperature: action === "continue_chapter" ? 0.8 : 0.6,
        maxTokens: action === "brainstorm_tab" || action === "critique_prose" ? 4096 : 3000,
      },
      { model: resolvedModel, provider: resolvedProvider, apiKeys },
    );
  } catch (err) {
    // Classify the error so the frontend can show the right recovery hint.
    const info = classifyAiError(err);
    return NextResponse.json(
      {
        error: info.message,
        error_kind: info.kind,
        provider: info.provider ?? resolvedProvider,
      },
      { status: 500 },
    );
  }

  // Run guard on prose output. critique_prose is special: the writer's own
  // draft (in `extra`) is what's being judged, not the model's JSON reply —
  // so the mechanical checks run against the input, giving the writer both
  // a deterministic (guard) and a judgment-based (structured, below) pass
  // over the same draft in one call.
  const guardViolations =
    action === "continue_chapter" ? checkProse(response.text, ctx.constitution)
    : action === "critique_prose" ? checkProse(extra ?? "", ctx.constitution)
    : [];

  // Third tier: real grammar/syntax parsing via HALPE Core, if it's been
  // deployed and HALPE_SERVICE_URL is set (see halpe-client.ts). Returns
  // null — not skipped silently, an explicit null — when unconfigured or
  // unreachable, so the response can omit the field entirely rather than
  // send a fake empty result.
  const grammarViolations = action === "critique_prose" ? await checkGrammar(extra ?? "") : null;

  // Parse structured responses
  let structured: unknown = undefined;
  const OBJECT_ACTIONS = new Set(["expand_card", "extract_entities", "generate_story_profile"]); // model returns {...}
  const ARRAY_ACTIONS = new Set(["brainstorm_tab", "contradiction_check", "critique_prose"]); // model returns [...]
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
      truncated: response.truncated ?? false,
    },
    guard: guardViolations.length > 0 ? guardViolations : undefined,
    grammar: grammarViolations ?? undefined,
  });
}
