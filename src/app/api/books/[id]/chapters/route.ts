import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const createChapterSchema = z.object({
  title: z.string().min(1),
  sortOrder: z.number().default(0),
  status: z.enum(["draft", "revision", "done"]).default("draft"),
  content: z.string().default(""),
  branchId: z.string().nullable().optional(),
  volumeId: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: bookId } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("book_id", bookId)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chapters: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const { id: bookId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createChapterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("chapters")
    .insert({
      book_id: bookId,
      user_id: user.id,
      title: parsed.data.title,
      sort_order: parsed.data.sortOrder,
      status: parsed.data.status,
      content: parsed.data.content,
      branch_id: parsed.data.branchId ?? null,
      volume_id: parsed.data.volumeId ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chapter: data });
}
