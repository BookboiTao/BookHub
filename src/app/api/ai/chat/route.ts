import { NextRequest, NextResponse } from "next/server";
import { requireUser, createSupabaseServer } from "@/lib/supabase-server";
import { callAI, resolveProvider, MODEL_CATALOG, type ProviderKey, type ChatMessage, type ToolCallRequest } from "@/lib/ai/provider-clients";
import { buildMessages, getAISettings, type Scope } from "@/lib/ai/context-builder";
import { checkProse } from "@/lib/ai/guard";
import { classifyAiError } from "@/lib/ai/provider-catalog";
import { TOOLS, isReadTool, isWriteTool } from "@/lib/ai/tools";
import { executeReadTool } from "@/lib/ai/tool-executors";
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
  const { system: baseSystem, messages: fullMessages, contextLayers, constitution } = await buildMessages(scope, messages);
  const system = `${baseSystem}\n\nYou have tools to look up and propose changes to this book's World Bible: search_bible, get_card, create_card, update_card, create_link. Use search_bible or get_card whenever you need a real fact instead of guessing — never state something about a character or place you haven't actually looked up. create_card, update_card, and create_link do NOT take effect immediately: calling one queues a proposal the person must explicitly approve, so it's safe to propose something and explain your reasoning in the same reply. Never claim in plain text that you created, updated, or linked something — if you mean to do that, call the tool; the person can only tell what you actually did from whether a tool was called, not from what you say you did.`;

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

  // Call the AI, looping while it requests read-only tools (search_bible,
  // get_card) so it can gather real facts before answering. A write tool
  // request (create_card, update_card, create_link) stops the loop
  // immediately — those never execute here, they come back as
  // pendingActions for the person to approve, same as everything else in
  // this app. Capped so a confused model can't loop forever on your bill.
  const MAX_ITERATIONS = 4;
  const loopMessages: ChatMessage[] = fullMessages.map((m) => ({ role: m.role, content: m.content }));
  const pendingActions: Record<string, unknown>[] = [];
  const toolTrace: { name: string; arguments: Record<string, unknown> }[] = [];

  try {
    let finalResponse: Awaited<ReturnType<typeof callAI>> | null = null;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await callAI(
        {
          system,
          messages: loopMessages,
          temperature: 0.7,
          maxTokens: 4096,
          tools: TOOLS,
        },
        { model: resolvedModel, provider: resolvedProvider, apiKeys },
      );

      if (!response.toolCalls || response.toolCalls.length === 0) {
        finalResponse = response;
        break;
      }

      const writeCalls = response.toolCalls.filter((tc) => isWriteTool(tc.name));
      const readCalls = response.toolCalls.filter((tc) => isReadTool(tc.name));

      for (const tc of response.toolCalls) toolTrace.push({ name: tc.name, arguments: tc.arguments });

      if (writeCalls.length > 0) {
        // Stop here — format each write call as a proposal and return
        // whatever text came with it (if any). Never execute.
        for (const tc of writeCalls) {
          pendingActions.push(await toPendingAction(tc, bookId));
        }
        finalResponse = response;
        break;
      }

      // All read tools — execute them for real, feed results back, and
      // let the model keep reasoning in the next iteration.
      loopMessages.push({
        role: "assistant",
        content: response.text,
        toolCalls: response.toolCalls,
      });
      for (const tc of readCalls) {
        const result = await executeReadTool(tc.name, tc.arguments, bookId);
        loopMessages.push({
          role: "tool",
          content: result,
          toolCallId: tc.id,
          toolName: tc.name,
        });
      }

      if (i === MAX_ITERATIONS - 1) {
        finalResponse = response;
      }
    }

    if (!finalResponse) {
      throw new Error("The AI didn't return a response.");
    }

    // Run guard on AI output
    const violations = checkProse(finalResponse.text, constitution);

    return NextResponse.json({
      text: finalResponse.text,
      pendingActions: pendingActions.length > 0 ? pendingActions : undefined,
      meta: {
        provider: finalResponse.provider,
        model: finalResponse.model,
        usage: finalResponse.usage,
        contextLayers,
        truncated: finalResponse.truncated ?? false,
        toolsUsed: toolTrace.length > 0 ? toolTrace : undefined,
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

/** Shape a model's write-tool request into the same format the client's
 * existing create/update endpoints already accept — so "Apply" on a
 * pending action is just a normal fetch to a normal route, nothing new. */
async function toPendingAction(tc: ToolCallRequest, bookId: string): Promise<Record<string, unknown>> {
  const a = tc.arguments;
  if (tc.name === "create_card") {
    return {
      kind: "create_card",
      category: a.category,
      title: a.title,
      summary: a.summary ?? "",
      body: a.body ?? "",
      tags: Array.isArray(a.tags) ? a.tags : [],
    };
  }
  if (tc.name === "update_card") {
    // Fetch the card's CURRENT values so the client can show a real
    // before/after diff instead of applying a proposal blind. If the
    // card was deleted since the model looked it up, old* is just
    // omitted — the diff view falls back to showing only the new value.
    let old: { title?: string; summary?: string; body?: string } = {};
    try {
      const supabase = await createSupabaseServer();
      const { data } = await supabase
        .from("cards")
        .select("title, summary, body")
        .eq("id", String(a.cardId ?? ""))
        .eq("book_id", bookId)
        .maybeSingle();
      if (data) old = { title: data.title, summary: data.summary, body: data.body };
    } catch {
      // Non-fatal — proposal still renders, just without the old-value diff.
    }
    return {
      kind: "update_card",
      cardId: a.cardId,
      title: a.title,
      summary: a.summary,
      body: a.body,
      oldTitle: old.title,
      oldSummary: old.summary,
      oldBody: old.body,
    };
  }
  if (tc.name === "create_link") {
    return {
      kind: "create_link",
      fromCardId: a.fromCardId,
      toCardId: a.toCardId,
      label: a.label,
    };
  }
  return { kind: "unknown", raw: tc };
}
