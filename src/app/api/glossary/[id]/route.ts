import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const patchGlossarySchema = z.object({
  term: z.string().min(1).optional(),
  definition: z.string().optional(),
  relatedCardId: z.string().nullable().optional(),
  firstUseChapterId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchGlossarySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.term !== undefined) updates.term = parsed.data.term;
  if (parsed.data.definition !== undefined) updates.definition = parsed.data.definition;
  if (parsed.data.relatedCardId !== undefined) updates.related_card_id = parsed.data.relatedCardId;
  if (parsed.data.firstUseChapterId !== undefined) updates.first_use_chapter_id = parsed.data.firstUseChapterId;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("glossary_terms")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ term: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id } = await params;
  const supabase = await createSupabaseServer();

  const { error } = await supabase.from("glossary_terms").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
