/* ------------------------------------------------------------------ *
 * provider-clients.ts — AI provider abstraction layer.
 *
 * Providers:
 *   - z.ai GLM (default, no key needed — uses z-ai-web-dev-sdk)
 *   - Google Gemini (needs API key — REST API via fetch)
 *
 * To add more providers later (OpenRouter, Anthropic, OpenAI...):
 *   1. Add it to MODEL_CATALOG with `requiresApiKey` flag + model list.
 *   2. Add a `callXxx(shape, model, apiKey)` function below.
 *   3. Add it to the switch in callAI().
 *
 * All server-side only. Never imported in client code.
 * ------------------------------------------------------------------ */

import ZAI from "z-ai-web-dev-sdk";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CallShape = {
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
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
};

export type ProviderKey = "zai" | "gemini";

type ModelDef = { id: string; label: string };

type ProviderDef = {
  default: string;
  label: string;
  requiresApiKey: boolean;
  models: ModelDef[];
  helpUrl?: string;
  keyHint?: string;
};

export const MODEL_CATALOG: Record<ProviderKey, ProviderDef> = {
  zai: {
    default: "glm-4-flash",
    label: "z.ai GLM",
    requiresApiKey: false,
    models: [
      { id: "glm-4-flash", label: "GLM-4-Flash (fast, free)" },
      { id: "glm-4-plus", label: "GLM-4-Plus (higher quality)" },
    ],
  },
  gemini: {
    default: "gemini-2.0-flash",
    label: "Google Gemini",
    requiresApiKey: true,
    helpUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza…",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (fast, cheap)" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (balanced)" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (highest quality)" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro (legacy)" },
    ],
  },
};

export const ALL_PROVIDER_KEYS: ProviderKey[] = Object.keys(MODEL_CATALOG) as ProviderKey[];

export const ALL_MODELS: { provider: ProviderKey; model: ModelDef }[] = ALL_PROVIDER_KEYS.flatMap(
  (provider) => MODEL_CATALOG[provider].models.map((model) => ({ provider, model })),
);

/**
 * Infer the provider from a model id. "gemini-*" → gemini, "glm-*" → z.ai.
 */
export function providerForModel(model: string): ProviderKey {
  if (model.startsWith("gemini")) return "gemini";
  return "zai";
}

/* ------------------------------------------------------------------ *
 * z.ai — primary provider, no key needed
 * ------------------------------------------------------------------ */
export async function callZai(
  shape: CallShape,
  model: string = MODEL_CATALOG.zai.default,
): Promise<AIResponse> {
  const zai = await ZAI.create();

  const messages = [
    ...(shape.system ? [{ role: "system" as const, content: shape.system }] : []),
    ...shape.messages,
  ];

  const response = await zai.chat.completions.create({
    model,
    messages,
    temperature: shape.temperature ?? 0.7,
    max_tokens: shape.maxTokens ?? 2000,
  });

  const text = response.choices[0]?.message?.content ?? "";
  const usage = response.usage;

  return {
    text,
    provider: "zai",
    model,
    usage: {
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
    },
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

  // Gemini uses "model" for the assistant role
  const contents = shape.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: shape.temperature ?? 0.7,
      maxOutputTokens: shape.maxTokens ?? 2000,
    },
  };

  if (shape.system) {
    body.systemInstruction = { parts: [{ text: shape.system }] };
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
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).filter(Boolean).join("\n") ?? "";
  const usageMeta = data?.usageMetadata;

  return {
    text,
    provider: "gemini",
    model,
    usage: {
      promptTokens: usageMeta?.promptTokenCount,
      completionTokens: usageMeta?.candidatesTokenCount,
      totalTokens: usageMeta?.totalTokenCount,
    },
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
    return callZai(shape, model);
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
