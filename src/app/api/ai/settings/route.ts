import { NextRequest, NextResponse } from "next/server";
import { requireUser, createSupabaseServer } from "@/lib/supabase-server";
import { CONSTITUTION_SEED, FINGERPRINT_SEED } from "@/lib/ai/context-builder";
import { z } from "zod";

const patchSettingsSchema = z.object({
  bookId: z.string(),
  constitution: z.array(z.object({
    id: z.string(),
    text: z.string(),
    enforcement: z.enum(["prompt", "code"]),
    active: z.boolean(),
  })).optional(),
  fingerprint: z.object({
    voice: z.string(),
    pacing: z.string(),
    tone: z.string(),
    samples: z.array(z.object({
      id: z.string(),
      label: z.string(),
      text: z.string(),
    })),
  }).optional(),
  router: z.record(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { searchParams } = new URL(req.url);
  const bookId = searchParams.get("bookId");
  if (!bookId) return NextResponse.json({ error: "bookId required" }, { status: 400 });

  const supabase = await createSupabaseServer();

  const { data } = await supabase
    .from("ai_settings")
    .select("constitution, fingerprint, router")
    .eq("book_id", bookId)
    .maybeSingle();

  return NextResponse.json({
    constitution: data?.constitution ?? CONSTITUTION_SEED,
    fingerprint: data?.fingerprint ?? FINGERPRINT_SEED,
    router: data?.router ?? {},
  });
}

export async function PATCH(req: NextRequest) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const body = await req.json().catch(() => null);
  const parsed = patchSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { bookId, constitution, fingerprint, router } = parsed.data;
  const supabase = await createSupabaseServer();

  // Upsert settings
  const { data: existing } = await supabase
    .from("ai_settings")
    .select("id")
    .eq("book_id", bookId)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    book_id: bookId,
    user_id: user.id,
  };
  if (constitution !== undefined) updates.constitution = constitution;
  if (fingerprint !== undefined) updates.fingerprint = fingerprint;
  if (router !== undefined) updates.router = router;

  let result;
  if (existing) {
    result = await supabase
      .from("ai_settings")
      .update(updates)
      .eq("book_id", bookId)
      .select()
      .single();
  } else {
    result = await supabase
      .from("ai_settings")
      .insert(updates)
      .select()
      .single();
  }

  if (result.error) {
    // DB write failed (table missing, RLS blocked, etc.).
    // Return a proper 500 so the client knows the save failed — NOT a
    // silent 200 with a note (which caused the user to think their
    // router settings were saved when they weren't).
    return NextResponse.json(
      {
        error: result.error.message ?? "Failed to save AI settings. Make sure the ai_settings table exists (run the SQL migration) and RLS allows your user to write.",
        code: result.error.code,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    constitution: result.data.constitution ?? CONSTITUTION_SEED,
    fingerprint: result.data.fingerprint ?? FINGERPRINT_SEED,
    router: result.data.router ?? {},
  });
}
