import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const createGlossarySchema = z.object({
  term: z.string().min(1),
  definition: z.string().default(""),
  relatedCardId: z.string().nullable().optional(),
  firstUseChapterId: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: bookId } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("glossary_terms")
    .select("*")
    .eq("book_id", bookId)
    .order("term", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ terms: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const { id: bookId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createGlossarySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("glossary_terms")
    .insert({
      book_id: bookId,
      user_id: user.id,
      term: parsed.data.term,
      definition: parsed.data.definition,
      related_card_id: parsed.data.relatedCardId ?? null,
      first_use_chapter_id: parsed.data.firstUseChapterId ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ term: data });
}
