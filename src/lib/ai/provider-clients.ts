/* ------------------------------------------------------------------ *
 * provider-clients.ts — AI provider CLIENT implementations.
 *
 * SERVER-ONLY — only ever called from route handlers (uses real API
 * keys). The pure data (MODEL_CATALOG, PROVIDER_NOTES, type defs,
 * classifier) lives in ./provider-catalog.ts which is client-safe.
 * Both server modules and client components import the catalog from
 * there.
 *
 * To add more providers later (OpenRouter, Anthropic, OpenAI...):
 *   1. Add an entry to MODEL_CATALOG in ./provider-catalog.ts.
 *   2. Add a `callXxx(shape, model, apiKey)` function below.
 *   3. Add it to the switch in callAI().
 * ------------------------------------------------------------------ */

// Re-export everything from the client-safe catalog so existing imports
// from "@/lib/ai/provider-clients" keep working in server code.
export {
  MODEL_CATALOG,
  ALL_PROVIDER_KEYS,
  ALL_MODELS,
  PROVIDER_NOTES,
  providerForModel,
  classifyAiError,
  ERROR_HINTS,
  type ProviderKey,
  type AiErrorKind,
} from "./provider-catalog";

import { MODEL_CATALOG, ALL_PROVIDER_KEYS, providerForModel, type ProviderKey } from "./provider-catalog";
import type { ToolDef } from "./tools";

/**
 * Decide which provider/model an AI call should use.
 *
 * If the router has an explicit model for this task, honor it. Otherwise —
 * this matters — DON'T blindly fall back to "zai": every provider in
 * MODEL_CATALOG currently requires its own API key (despite z.ai being
 * described in a couple of places as "free, no key" — it isn't; it just
 * has a free tier once you've added your own key). A book with only a
 * Gemini key saved would otherwise have every unrouted task (most
 * conspicuously extract_entities, which isn't even in the Router UI's task
 * list yet) silently try z.ai, fail with "Z.ai API key is missing", and
 * look broken even though the writer DID set up a provider.
 *
 * Instead, fall back to whichever provider the user actually has a saved
 * key for. Only if they have none at all do we fall through to z.ai's
 * default (so the error message they see is the familiar "add a key").
 */
export function resolveProvider(
  routerModel: string | undefined,
  apiKeys: Partial<Record<ProviderKey, string>>,
): { model?: string; provider: ProviderKey } {
  if (routerModel) {
    return { model: routerModel, provider: providerForModel(routerModel) };
  }
  const withKey = ALL_PROVIDER_KEYS.find((p) => apiKeys[p]);
  return { model: undefined, provider: withKey ?? "zai" };
}

export type ToolCallRequest = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Set on an assistant message that requested tool calls (needed so the
   * next request in the loop can reference them correctly per-provider). */
  toolCalls?: ToolCallRequest[];
  /** Set on a "tool" role message — which call this is the result of. */
  toolCallId?: string;
  toolName?: string;
};

export type CallShape = {
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** If provided, the model may request one of these instead of (or
   * alongside) replying with plain text. See tools.ts for the read/write
   * split and why write tools never auto-execute. */
  tools?: ToolDef[];
};

export type AIResponse = {
  text: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /**
   * True when the provider stopped generating because it hit the
   * maxTokens budget (z.ai finish_reason "length" / Gemini finishReason
   * "MAX_TOKENS"), NOT because the model reached a natural end. Callers
   * should surface this — otherwise a mid-sentence cutoff silently reads
   * as a complete reply.
   */
  truncated?: boolean;
  /** Tool calls the model requested this turn, if any. Empty/undefined
   * means the model just replied with text — `text` is the final answer. */
  toolCalls?: ToolCallRequest[];
};

/* ------------------------------------------------------------------ *
 * Z.ai GLM — real public API, OpenAI-compatible chat completions.
 * Needs a free API key from https://z.ai/model-api (Sign up → API Keys).
 * glm-4.5-flash is free (rate-limited); other GLM models are paid.
 * ------------------------------------------------------------------ */
export async function callZai(
  shape: CallShape,
  model: string = MODEL_CATALOG.zai.default,
  apiKey: string = "",
): Promise<AIResponse> {
  if (!apiKey) {
    throw new Error("Z.ai API key is missing. Add it in AI Studio → Providers.");
  }

  // Build the OpenAI-shaped message array. An assistant message that
  // requested tool calls must carry them in `tool_calls`; a tool-result
  // message needs `tool_call_id` and no other role fields.
  const messages = [
    ...(shape.system ? [{ role: "system" as const, content: shape.system }] : []),
    ...shape.messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool" as const, tool_call_id: m.toolCallId, content: m.content };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant" as const,
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    }),
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: shape.temperature ?? 0.7,
    max_tokens: shape.maxTokens ?? 4096,
  };
  if (shape.tools?.length) {
    body.tools = shape.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }

  const res = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errMsg = `Z.ai HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      errMsg = errJson?.error?.message ?? errJson?.message ?? errMsg;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(`Z.ai error: ${errMsg}`);
  }

  const response = await res.json();
  const message = response?.choices?.[0]?.message;
  const text: string = message?.content ?? "";
  const usage = response?.usage;
  const finishReason = response?.choices?.[0]?.finish_reason;

  const rawToolCalls = message?.tool_calls as
    | { id: string; function: { name: string; arguments: string } }[]
    | undefined;
  const toolCalls: ToolCallRequest[] | undefined = rawToolCalls?.map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      // Model returned malformed JSON args — surface as empty args rather
      // than crashing the whole response; the executor will report the
      // missing required fields back to the model.
    }
    return { id: tc.id, name: tc.function.name, arguments: args };
  });

  return {
    text,
    provider: "zai",
    model,
    usage: {
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
    },
    truncated: finishReason === "length",
    toolCalls,
  };
}

/* ------------------------------------------------------------------ *
 * Gemini — Google's REST API. Needs an API key from
 * https://aistudio.google.com/apikey
 * ------------------------------------------------------------------ */
export async function callGemini(
  shape: CallShape,
  model: string,
  apiKey: string,
): Promise<AIResponse> {
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Add it in AI Studio → Providers.");
  }

  // Gemini's content array: "model" for the assistant role, "user" for
  // both the human and (per Gemini's documented pattern) tool results —
  // a tool-result turn is a "user" Content whose part is a functionResponse
  // rather than text. An assistant turn that requested tools carries a
  // functionCall part instead of text.
  const contents = shape.messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user" as const,
        parts: [{
          functionResponse: {
            name: m.toolName ?? "unknown",
            response: { result: m.content },
          },
        }],
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "model" as const,
        parts: m.toolCalls.map((tc) => ({
          functionCall: { name: tc.name, args: tc.arguments },
        })),
      };
    }
    return {
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    };
  });

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: shape.temperature ?? 0.7,
      maxOutputTokens: shape.maxTokens ?? 4096,
    },
  };

  if (shape.system) {
    body.systemInstruction = { parts: [{ text: shape.system }] };
  }

  if (shape.tools?.length) {
    body.tools = [{
      functionDeclarations: shape.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: toGeminiSchema(t.parameters),
      })),
    }];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errMsg = `Gemini HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      errMsg = errJson?.error?.message ?? errMsg;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(`Gemini error: ${errMsg}`);
  }

  const data = await res.json();
  const parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }[] =
    data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text).filter(Boolean).join("\n");
  const usageMeta = data?.usageMetadata;
  const finishReason = data?.candidates?.[0]?.finishReason;

  const functionCallParts = parts.filter((p) => p.functionCall);
  const toolCalls: ToolCallRequest[] | undefined = functionCallParts.length > 0
    ? functionCallParts.map((p, i) => ({
        // Gemini doesn't hand back a call id — synthesize one so the loop
        // can still address individual results.
        id: `gemini-call-${Date.now()}-${i}`,
        name: p.functionCall!.name,
        arguments: p.functionCall!.args ?? {},
      }))
    : undefined;

  return {
    text,
    provider: "gemini",
    model,
    usage: {
      promptTokens: usageMeta?.promptTokenCount,
      completionTokens: usageMeta?.candidatesTokenCount,
      totalTokens: usageMeta?.totalTokenCount,
    },
    truncated: finishReason === "MAX_TOKENS",
    toolCalls,
  };
}

/** Gemini's Schema object requires UPPERCASE type names (STRING, OBJECT,
 * ARRAY...) unlike the lowercase JSON-Schema-style types tools.ts uses
 * everywhere else — this is the one adapter point for that difference. */
export function toGeminiSchema(params: ToolDef["parameters"]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [key, p] of Object.entries(params.properties)) {
    const entry: Record<string, unknown> = {
      type: p.type.toUpperCase(),
      description: p.description,
    };
    if (p.enum) entry.enum = p.enum;
    if (p.items) entry.items = { type: p.items.type.toUpperCase() };
    properties[key] = entry;
  }
  return {
    type: "OBJECT",
    properties,
    required: params.required,
  };
}

/**
 * Route a call to the appropriate provider based on the model / explicit provider.
 * If the provider needs an API key, it must be supplied in `apiKeys`.
 */
export async function callAI(
  shape: CallShape,
  options?: {
    model?: string;
    provider?: ProviderKey;
    apiKeys?: Partial<Record<ProviderKey, string>>;
  },
): Promise<AIResponse> {
  const provider = options?.provider ?? providerForModel(options?.model ?? "");
  const model = options?.model ?? MODEL_CATALOG[provider].default;

  if (provider === "zai") {
    return callZai(shape, model, options?.apiKeys?.zai ?? "");
  }
  if (provider === "gemini") {
    return callGemini(shape, model, options?.apiKeys?.gemini ?? "");
  }

  throw new Error(`Provider ${provider} not configured yet`);
}

/**
 * Smoke test — ping the provider with a tiny prompt.
 * For keyless providers (z.ai) this always runs.
 * For key-required providers, only runs if apiKeys has an entry.
 */
export async function testProvider(
  provider: ProviderKey,
  apiKeys?: Partial<Record<ProviderKey, string>>,
): Promise<{
  provider: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  requiresKey: boolean;
  hasKey: boolean;
  error?: string;
}> {
  const def = MODEL_CATALOG[provider];
  const start = Date.now();
  const hasKey = !def.requiresApiKey || Boolean(apiKeys?.[provider]);

  if (!hasKey) {
    return {
      provider,
      label: def.label,
      ok: false,
      latencyMs: 0,
      requiresKey: def.requiresApiKey,
      hasKey: false,
    };
  }

  try {
    const res = await callAI(
      {
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        maxTokens: 10,
        temperature: 0,
      },
      { provider, apiKeys },
    );
    const latencyMs = Date.now() - start;
    return {
      provider,
      label: def.label,
      ok: res.text.trim().length > 0,
      latencyMs,
      requiresKey: def.requiresApiKey,
      hasKey: true,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      provider,
      label: def.label,
      ok: false,
      latencyMs,
      requiresKey: def.requiresApiKey,
      hasKey: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
