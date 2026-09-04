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

/**
 * Classify an error using the shared classifier in provider-catalog.ts.
 * Keeps the route handler in sync with the catalog without duplicating
 * the substring matching logic.
 */
function classify(err: unknown) {
  return classifyAiError(err);
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
        ...(routerModel ? {} : { fallbackNote: "Used default provider" }),
      },
      guard: violations.length > 0 ? violations : undefined,
    });
  } catch (err) {
    // Classify the error using the shared classifier.
    const info = classify(err);

    // GRACEFUL FALLBACK: if z.ai failed because the SDK couldn't init
    // (e.g. /etc/.z-ai-config not readable in some environment), and the
    // user has a Gemini key saved, retry the call with Gemini's default
    // model. The user is not routed to Gemini explicitly, so this is a
    // best-effort recovery — we tell them we did it.
    if (info.kind === "sdk_init_failed" && apiKeys.gemini && !routerModel) {
      try {
        const fallbackModel = MODEL_CATALOG.gemini.default;
        const response = await callAI(
          {
            system,
            messages: fullMessages,
            temperature: 0.7,
            maxTokens: 2000,
          },
          { model: fallbackModel, apiKeys },
        );
        const violations = checkProse(response.text);
        return NextResponse.json({
          text: response.text,
          meta: {
            provider: response.provider,
            model: response.model,
            usage: response.usage,
            contextLayers,
            fallback: true,
            fallbackReason: "z.ai SDK was unavailable — used Gemini instead. To use Gemini permanently, route the chat task to a Gemini model in AI Studio → Router.",
          },
          guard: violations.length > 0 ? violations : undefined,
        });
      } catch (fallbackErr) {
        // Gemini also failed — fall through to return the original error
        const fbInfo = classify(fallbackErr);
        return NextResponse.json(
          {
            error: `z.ai failed (${info.message}) AND Gemini fallback failed (${fbInfo.message}). Add a valid Gemini API key in AI Studio → Providers.`,
            error_kind: fbInfo.kind,
            provider: "gemini",
          },
          { status: 500 },
        );
      }
    }

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
