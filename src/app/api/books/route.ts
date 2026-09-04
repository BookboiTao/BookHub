import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser, ensureUserRow } from "@/lib/supabase-server";
import { z } from "zod";

const createBookSchema = z.object({
  title: z.string().min(1),
  genre: z.string().optional(),
  blurb: z.string().optional(),
  visibility: z.enum(["public", "private"]).default("private"),
  worldSummaryTitle: z.string().optional(),
  worldSummaryBody: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export async function GET() {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  await ensureUserRow(user.id, user.email ?? "");
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ books: data ?? [] });
}

export async function POST(req: NextRequest) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  await ensureUserRow(user.id, user.email ?? "");

  const body = await req.json().catch(() => null);
  const parsed = createBookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("books")
    .insert({
      user_id: user.id,
      title: parsed.data.title,
      genre: parsed.data.genre,
      blurb: parsed.data.blurb,
      visibility: parsed.data.visibility,
      world_summary_title: parsed.data.worldSummaryTitle,
      world_summary_body: parsed.data.worldSummaryBody,
      tags: parsed.data.tags,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ book: data });
}
