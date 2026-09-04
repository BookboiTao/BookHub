import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const patchDraftSchema = z.object({
  isMain: z.boolean().optional(),
  message: z.string().optional(),
  why: z.string().nullable().optional(),
  content: z.string().optional(),
  hash: z.string().optional(),
  wordCount: z.number().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: draftId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();

  // If publishing (isMain=true being set), first find this draft's chapter,
  // then unset is_main on sibling drafts.
  if (parsed.data.isMain) {
    const { data: draft } = await supabase
      .from("drafts")
      .select("chapter_id")
      .eq("id", draftId)
      .maybeSingle();

    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { error: unpubError } = await supabase
      .from("drafts")
      .update({ is_main: false })
      .eq("chapter_id", draft.chapter_id)
      .eq("is_main", true)
      .neq("id", draftId);
    if (unpubError) return NextResponse.json({ error: unpubError.message }, { status: 500 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.isMain !== undefined) updates.is_main = parsed.data.isMain;
  if (parsed.data.message !== undefined) updates.message = parsed.data.message;
  if (parsed.data.why !== undefined) updates.why = parsed.data.why;
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.hash !== undefined) updates.hash = parsed.data.hash;
  if (parsed.data.wordCount !== undefined) updates.word_count = parsed.data.wordCount;

  const { data, error } = await supabase
    .from("drafts")
    .update(updates)
    .eq("id", draftId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ draft: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: draftId } = await params;
  const supabase = await createSupabaseServer();

  const { error } = await supabase.from("drafts").delete().eq("id", draftId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
