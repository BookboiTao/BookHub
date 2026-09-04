import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const createCardSchema = z.object({
  category: z.enum([
    "magic", "cosmology", "geography", "factions", "history", "bestiary", "character",
  ]),
  title: z.string().min(1),
  summary: z.string().default(""),
  body: z.string().default(""),
  canonStatus: z.enum(["canon", "draft", "deprecated"]).default("draft"),
  x: z.number().default(0),
  y: z.number().default(0),
  sortOrder: z.number().nullable().optional(),
  tags: z.array(z.string()).default([]),
  fields: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  characterData: z.any().optional(),
  zoneId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: bookId } = await params;
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const supabase = await createSupabaseServer();
  let query = supabase.from("cards").select("*").eq("book_id", bookId);
  if (category) query = query.eq("category", category);
  query = query.order("created_at", { ascending: true });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const { id: bookId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("cards")
    .insert({
      book_id: bookId,
      user_id: user.id,
      zone_id: parsed.data.zoneId ?? null,
      category: parsed.data.category,
      title: parsed.data.title,
      summary: parsed.data.summary,
      body: parsed.data.body,
      canon_status: parsed.data.canonStatus,
      x: parsed.data.x,
      y: parsed.data.y,
      sort_order: parsed.data.sortOrder ?? null,
      tags: parsed.data.tags,
      fields: parsed.data.fields,
      character_data: parsed.data.characterData ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
