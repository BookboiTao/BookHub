import { NextRequest, NextResponse } from "next/server";
import { requireUser, createSupabaseServer } from "@/lib/supabase-server";
import { callAI, providerForModel, MODEL_CATALOG, type ProviderKey } from "@/lib/ai/provider-clients";
import { buildMessages, getAISettings, type Scope } from "@/lib/ai/context-builder";
import { checkProse } from "@/lib/ai/guard";
import { classifyAiError } from "@/lib/ai/provider-catalog";
import { z } from "zod";

const chatSchema = z.object({
  bookId: z.string(),
  scope: z.object({
    type: z.enum(["tab", "editor", "card", "overview"]),
    bookId: z.string(),
    tab: z.string().optional(),
    chapterId: z.string().optional(),
    cardId: z.string().optional(),
  }),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })),
});

/**
 * Loads the user's saved API keys for every provider that requires one.
 * Returns a map suitable for passing into callAI({ apiKeys }).
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
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { bookId, scope: rawScope, messages } = parsed.data;

  // Build the scope object
  const scope: Scope = {
    type: rawScope.type,
    bookId,
    ...(rawScope.tab ? { tab: rawScope.tab } : {}),
    ...(rawScope.chapterId ? { chapterId: rawScope.chapterId } : {}),
    ...(rawScope.cardId ? { cardId: rawScope.cardId } : {}),
  } as Scope;

  // Assemble context + messages
  const { system, messages: fullMessages, contextLayers } = await buildMessages(scope, messages);

  // Consult the router for the model to use for chat
  const settings = await getAISettings(bookId);
  const router = (settings.router ?? {}) as Record<string, string>;
  const routerModel = router.chat;

  // Always load the user's API keys — we need them for the fallback path
  // (if z.ai fails with sdk_init_failed and the user has a Gemini key,
  // we retry the call with Gemini).
  const apiKeys = await loadUserApiKeys(user.id);

  // If the router points to a provider that needs a key, validate it's present.
  if (routerModel) {
    const p = providerForModel(routerModel);
    if (MODEL_CATALOG[p].requiresApiKey && !apiKeys[p]) {
      return NextResponse.json(
        {
          error: `Router is set to use ${MODEL_CATALOG[p].label} for chat, but you haven't added an API key yet. Visit AI Studio → Providers to add one.`,
          error_kind: "missing_key",
          provider: p,
        },
        { status: 400 },
      );
    }
  }

  // Call the AI
  try {
    const response = await callAI(
      {
        system,
        messages: fullMessages,
        temperature: 0.7,
        maxTokens: 2000,
      },
      { model: routerModel, apiKeys },
    );

    // Run guard on AI output
    const violations = checkProse(response.text);

    return NextResponse.json({
      text: response.text,
      meta: {
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        contextLayers,
      },
      guard: violations.length > 0 ? violations : undefined,
    });
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
}
