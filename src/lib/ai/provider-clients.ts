/* ------------------------------------------------------------------ *
 * provider-clients.ts — AI provider abstraction layer.
 * 
 * Currently uses z-ai-web-dev-sdk (already installed, no extra keys needed).
 * Can be extended to add Gemini/OpenRouter later — just add another
 * provider function that matches the callShape.
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

export const MODEL_CATALOG = {
  zai: {
    default: "glm-4-flash",
    alternates: ["glm-4-plus", "glm-4-flash"],
    label: "z.ai GLM",
  },
} as const;

export type ProviderKey = keyof typeof MODEL_CATALOG;

/**
 * Call the z.ai provider using the z-ai-web-dev-sdk.
 * This is the primary (and currently only) provider.
 */
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

/**
 * Route a call to the appropriate provider based on the task.
 * Currently everything goes to z.ai. When more providers are added,
 * the router table (from AI Studio settings) determines the routing.
 */
export async function callAI(
  shape: CallShape,
  options?: { model?: string; provider?: ProviderKey },
): Promise<AIResponse> {
  const provider = options?.provider ?? "zai";
  const model = options?.model ?? MODEL_CATALOG[provider].default;

  if (provider === "zai") {
    return callZai(shape, model);
  }

  throw new Error(`Provider ${provider} not configured yet`);
}

/**
 * Smoke test — ping the provider with a tiny prompt.
 */
export async function testProvider(
  provider: ProviderKey = "zai",
): Promise<{ provider: string; ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await callAI(
      {
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        maxTokens: 10,
        temperature: 0,
      },
      { provider },
    );
    const latencyMs = Date.now() - start;
    return {
      provider,
      ok: res.text.trim().length > 0,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      provider,
      ok: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
