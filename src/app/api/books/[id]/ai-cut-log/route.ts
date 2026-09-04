import { NextRequest, NextResponse } from "next/server";
import { requireUser, createSupabaseServer } from "@/lib/supabase-server";
import { z } from "zod";

const createCutLogSchema = z.object({
  source: z.enum(["ai_proposal", "guard_pass"]).default("ai_proposal"),
  kind: z.enum(["discarded", "edited", "inserted"]).default("discarded"),
  beforeText: z.string().optional(),
  afterText: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: bookId } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("ai_cut_log")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cutLog: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const { id: bookId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createCutLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("ai_cut_log")
    .insert({
      book_id: bookId,
      user_id: user.id,
      source: parsed.data.source,
      kind: parsed.data.kind,
      before_text: parsed.data.beforeText ?? null,
      after_text: parsed.data.afterText ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}
