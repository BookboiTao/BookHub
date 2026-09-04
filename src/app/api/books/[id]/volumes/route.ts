import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const createVolumeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  sortOrder: z.number().default(0),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const { id: bookId } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("volumes")
    .select("*")
    .eq("book_id", bookId)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ volumes: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;
  const { id: bookId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createVolumeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("volumes")
    .insert({
      book_id: bookId,
      user_id: user.id,
      title: parsed.data.title,
      summary: parsed.data.summary,
      sort_order: parsed.data.sortOrder,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ volume: data });
}
