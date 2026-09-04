import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const createZoneSchema = z.object({
  category: z.string(),
  label: z.string().optional(),
  tint: z.string().nullable().optional(),
  x: z.number().default(0),
  y: z.number().default(0),
  w: z.number().default(200),
  h: z.number().default(150),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: bookId } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("zones")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ zones: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const { id: bookId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createZoneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("zones")
    .insert({
      book_id: bookId,
      user_id: user.id,
      category: parsed.data.category,
      label: parsed.data.label,
      tint: parsed.data.tint ?? null,
      x: parsed.data.x,
      y: parsed.data.y,
      w: parsed.data.w,
      h: parsed.data.h,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ zone: data });
}
