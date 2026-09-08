import { NextRequest, NextResponse } from "next/server";
import { requireUser, createSupabaseServer } from "@/lib/supabase-server";
import { callAI, resolveProvider, MODEL_CATALOG, type ProviderKey } from "@/lib/ai/provider-clients";
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
  const { system, messages: fullMessages, contextLayers, constitution } = await buildMessages(scope, messages);

  // Consult the router for the model to use for chat
  const settings = await getAISettings(bookId);
  const router = (settings.router ?? {}) as Record<string, string>;
  const routerModel = router.chat;

  // Load the user's saved API keys — needed for whichever provider the
  // router (or explicit request) selects.
  const apiKeys = await loadUserApiKeys(user.id);

  // Resolve which provider/model this call actually uses. Falls back to
  // whichever provider the user has a key for when chat isn't explicitly
  // routed — see resolveProvider's doc comment.
  const { model: resolvedModel, provider: resolvedProvider } = resolveProvider(routerModel, apiKeys);
  if (MODEL_CATALOG[resolvedProvider].requiresApiKey && !apiKeys[resolvedProvider]) {
    return NextResponse.json(
      {
        error: routerModel
          ? `Router is set to use ${MODEL_CATALOG[resolvedProvider].label} for chat, but you haven't added an API key yet. Visit AI Studio → Providers to add one.`
          : `This needs an AI provider set up first. Visit AI Studio → Providers and add a free API key (Z.ai or Gemini).`,
        error_kind: "missing_key",
        provider: resolvedProvider,
      },
      { status: 400 },
    );
  }

  // Call the AI
  try {
    const response = await callAI(
      {
        system,
        messages: fullMessages,
        temperature: 0.7,
        maxTokens: 4096,
      },
      { model: resolvedModel, provider: resolvedProvider, apiKeys },
    );

    // Run guard on AI output
    const violations = checkProse(response.text, constitution);

    return NextResponse.json({
      text: response.text,
      meta: {
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        contextLayers,
        truncated: response.truncated ?? false,
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
        provider: info.provider ?? resolvedProvider,
      },
      { status: 500 },
    );
  }
}
