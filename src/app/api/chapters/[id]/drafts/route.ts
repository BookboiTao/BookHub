import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const createDraftSchema = z.object({
  content: z.string().default(""),
  message: z.string().default(""),
  why: z.string().nullable().optional(),
  hash: z.string().optional(),
  isMain: z.boolean().default(false),
  wordCount: z.number().default(0),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: chapterId } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("drafts")
    .select("*")
    .eq("chapter_id", chapterId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drafts: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const { id: chapterId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();

  // If publishing (isMain=true), unset is_main on all other drafts for this chapter.
  // Two calls — the partial unique index drafts_one_main enforces one-main at the DB.
  if (parsed.data.isMain) {
    const { error: unpubError } = await supabase
      .from("drafts")
      .update({ is_main: false })
      .eq("chapter_id", chapterId)
      .eq("is_main", true);
    if (unpubError) return NextResponse.json({ error: unpubError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("drafts")
    .insert({
      chapter_id: chapterId,
      user_id: user.id,
      content: parsed.data.content,
      message: parsed.data.message,
      why: parsed.data.why ?? null,
      hash: parsed.data.hash ?? Math.random().toString(16).slice(2, 9),
      is_main: parsed.data.isMain,
      word_count: parsed.data.wordCount,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft: data });
}
