import { NextResponse } from "next/server";
import { requireUser, createSupabaseServer } from "@/lib/supabase-server";
import { ALL_PROVIDER_KEYS, testProvider } from "@/lib/ai/provider-clients";

/**
 * GET /api/ai/test
 *   Live-pings every provider with a trivial completion (1 token,
 *   temperature 0) to check real connectivity, not just "is a key
 *   saved" — a saved key can still be invalid or expired, which only
 *   an actual call catches. Returns { providers: ProviderStatus[] }.
 */
export async function GET() {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const supabase = await createSupabaseServer();
  const { data: rows } = await supabase
    .from("ai_provider_keys")
    .select("provider, api_key")
    .eq("user_id", userOr401.id);

  const apiKeys: Partial<Record<string, string>> = {};
  for (const row of rows ?? []) {
    if (row.api_key) apiKeys[row.provider as string] = row.api_key as string;
  }

  const results = await Promise.all(
    ALL_PROVIDER_KEYS.map((p) => testProvider(p, apiKeys)),
  );

  return NextResponse.json({ providers: results });
}
