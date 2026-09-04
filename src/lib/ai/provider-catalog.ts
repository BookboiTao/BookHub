/* ------------------------------------------------------------------ *
 * provider-catalog.ts — pure data, no server-only imports.
 *
 * This is the CLIENT-SAFE subset of the provider catalog. It contains
 * only constants and type definitions — no SDK imports, no API calls.
 *
 * Both client components (AI Studio, AiErrorBanner) and server modules
 * (provider-clients.ts) import from here so the catalog stays in sync.
 * ------------------------------------------------------------------ */

export type ProviderKey = "zai" | "gemini";

type ModelDef = { id: string; label: string };

export type ProviderDef = {
  default: string;
  label: string;
  requiresApiKey: boolean;
  helpUrl?: string;
  keyHint?: string;
  models: ModelDef[];
};

export const MODEL_CATALOG: Record<ProviderKey, ProviderDef> = {
  zai: {
    default: "glm-4.5-flash",
    label: "Z.ai GLM",
    requiresApiKey: true,
    helpUrl: "https://z.ai/model-api",
    keyHint: "your Z.ai API key",
    models: [
      { id: "glm-4.5-flash", label: "GLM-4.5-Flash (free)" },
      { id: "glm-4.7-flash", label: "GLM-4.7-Flash (free, newer)" },
    ],
  },
  gemini: {
    default: "gemini-3.6-flash",
    label: "Google Gemini",
    requiresApiKey: true,
    helpUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza…",
    models: [
      { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash (newest, free tier)" },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (workhorse, free tier)" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (free tier)" },
    ],
  },
};

export const ALL_PROVIDER_KEYS: ProviderKey[] = Object.keys(MODEL_CATALOG) as ProviderKey[];

export const ALL_MODELS: { provider: ProviderKey; model: ModelDef }[] = ALL_PROVIDER_KEYS.flatMap(
  (provider) => MODEL_CATALOG[provider].models.map((model) => ({ provider, model })),
);

/**
 * Built-in provider note. Displayed in AI Studio so the user understands
 * why z.ai "just works" without them pasting a key.
 */
export const PROVIDER_NOTES: Record<ProviderKey, string> = {
  zai:
    "Requires a Z.ai API key (free to create). Sign up at https://z.ai/model-api, then create a key at https://z.ai/manage-apikey/apikey-list and paste it below. Both models listed here (GLM-4.5-Flash and GLM-4.7-Flash) are free to use.",
  gemini:
    "Requires a Google AI Studio API key. Get one free at https://aistudio.google.com/apikey — paste it in the field below. The Flash models listed here (3.5/3.6/3.7) are all on the free tier with rate limits; Pro models and older Flash versions have been dropped since they're paid or no longer reliable on the free tier.",
};

/**
 * Infer the provider from a model id.
 *   - "gemini-*" → gemini
 *   - "glm-*"    → zai
 *   - Anything else → zai (the default, keyless provider)
 *
 * This lets the Router tab accept arbitrary custom model ids (e.g. a
 * future "gemini-3.6-flash" or a model we haven't added to the catalog
 * yet) without breaking the dispatch logic.
 */
export function providerForModel(model: string): ProviderKey {
  if (model.startsWith("gemini")) return "gemini";
  return "zai";
}

/**
 * Human-readable hint for each AI error kind, telling the user what to do.
 */
export type AiErrorKind =
  | "missing_key"
  | "bad_key"
  | "rate_limited"
  | "quota_exceeded"
  | "model_not_found"
  | "network"
  | "sdk_init_failed"
  | "unknown";

export const ERROR_HINTS: Record<AiErrorKind, { title: string; hint: string; cta: string | null }> = {
  missing_key: {
    title: "Missing API key",
    hint: "This task is routed to a provider that needs an API key, but you haven't added one yet.",
    cta: "Add key in AI Studio",
  },
  bad_key: {
    title: "Invalid API key",
    hint: "The provider rejected your API key. Re-save it — make sure you copied the full key without trailing spaces.",
    cta: "Fix key in AI Studio",
  },
  rate_limited: {
    title: "Rate limited",
    hint: "You're sending requests too fast. Wait a moment and try again.",
    cta: null,
  },
  quota_exceeded: {
    title: "Quota exceeded",
    hint: "You've hit the provider's daily/monthly limit. Wait for reset, upgrade your plan, or switch to another model in the Router tab.",
    cta: "Open Router tab",
  },
  model_not_found: {
    title: "Model not found",
    hint: "The model id you selected doesn't exist on this provider. Pick a different model in the Router tab.",
    cta: "Open Router tab",
  },
  network: {
    title: "Network error",
    hint: "Couldn't reach the provider. Check your connection and try again.",
    cta: null,
  },
  sdk_init_failed: {
    title: "Provider unavailable",
    hint: "The provider client failed to initialize. Try again, or switch this task to a different model in the Router tab.",
    cta: "Open Router tab",
  },
  unknown: {
    title: "AI call failed",
    hint: "An unexpected error occurred. Try again, or check AI Studio → Providers.",
    cta: "Open AI Studio",
  },
};

/**
 * Classify an AI error so the UI can show the right recovery hint.
 */
export function classifyAiError(error: unknown): {
  kind: AiErrorKind;
  message: string;
  provider?: string;
} {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (lower.includes("api key not valid") || lower.includes("api_key_invalid") || lower.includes("unauthorized")) {
    return { kind: "bad_key", message: msg };
  }
  if (lower.includes("missing") && lower.includes("key")) {
    return { kind: "missing_key", message: msg };
  }
  if (lower.includes("429") || lower.includes("too many requests") || lower.includes("rate limit")) {
    return { kind: "rate_limited", message: msg };
  }
  if (lower.includes("quota") || lower.includes("billing") || lower.includes("insufficient")) {
    return { kind: "quota_exceeded", message: msg };
  }
  if (lower.includes("model not found") || lower.includes("not found") || lower.includes("404")) {
    return { kind: "model_not_found", message: msg };
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("econnrefused") || lower.includes("timeout")) {
    return { kind: "network", message: msg };
  }
  return { kind: "unknown", message: msg };
}
