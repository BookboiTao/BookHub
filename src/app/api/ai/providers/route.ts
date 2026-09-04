import { NextRequest, NextResponse } from "next/server";
import { requireUser, createSupabaseServer } from "@/lib/supabase-server";
import { MODEL_CATALOG, ALL_PROVIDER_KEYS, type ProviderKey } from "@/lib/ai/provider-clients";
import { z } from "zod";

/**
 * GET /api/ai/providers
 *   Returns the list of supported providers, plus the keys the current
 *   user has saved. Keys are masked — only `last4` and `hasKey` are exposed.
 *
 * PATCH /api/ai/providers
 *   body: { provider: "gemini", apiKey: "AIza..." }
 *   Upserts the user's key for that provider. Returns the masked view.
 *
 * DELETE /api/ai/providers?provider=gemini
 *   Removes the user's key for that provider.
 */
export async function GET() {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const supabase = await createSupabaseServer();
  const { data: rows } = await supabase
    .from("ai_provider_keys")
    .select("provider, api_key, updated_at")
    .eq("user_id", userOr401.id);

  const userKeys: Record<string, { hasKey: boolean; last4: string | null; updatedAt: string | null }> = {};
  for (const p of ALL_PROVIDER_KEYS) {
    const row = rows?.find((r: { provider: string }) => r.provider === p);
    userKeys[p] = {
      hasKey: Boolean(row?.api_key),
      last4: row?.api_key ? String(row.api_key).slice(-4) : null,
      updatedAt: row?.updated_at ?? null,
    };
  }

  return NextResponse.json({
    providers: ALL_PROVIDER_KEYS.map((p) => ({
      key: p,
      label: MODEL_CATALOG[p].label,
      requiresApiKey: MODEL_CATALOG[p].requiresApiKey,
      helpUrl: MODEL_CATALOG[p].helpUrl ?? null,
      keyHint: MODEL_CATALOG[p].keyHint ?? null,
      models: MODEL_CATALOG[p].models,
      defaultModel: MODEL_CATALOG[p].default,
      saved: userKeys[p],
    })),
  });
}

const patchSchema = z.object({
  provider: z.enum(["gemini"]),
  apiKey: z.string().min(8).max(500),
  label: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { provider, apiKey, label } = parsed.data;
  const supabase = await createSupabaseServer();

  const { error } = await supabase
    .from("ai_provider_keys")
    .upsert(
      { user_id: user.id, provider, api_key: apiKey, label: label ?? null },
      { onConflict: "user_id,provider" },
    );

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to save key. Make sure the ai_provider_keys table exists." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, provider, last4: apiKey.slice(-4) });
}

export async function DELETE(req: NextRequest) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider") as ProviderKey | null;
  if (!provider) {
    return NextResponse.json({ error: "provider query param required" }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  await supabase
    .from("ai_provider_keys")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", provider);

  return NextResponse.json({ ok: true, provider });
}
