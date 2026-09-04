import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const patchCardSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
  body: z.string().optional(),
  canonStatus: z.enum(["canon", "draft", "deprecated"]).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  sortOrder: z.number().nullable().optional(),
  tags: z.array(z.string()).optional(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  characterData: z.any().optional(),
  zoneId: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ card: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.summary !== undefined) updates.summary = parsed.data.summary;
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.canonStatus !== undefined) updates.canon_status = parsed.data.canonStatus;
  if (parsed.data.x !== undefined) updates.x = parsed.data.x;
  if (parsed.data.y !== undefined) updates.y = parsed.data.y;
  if (parsed.data.sortOrder !== undefined) updates.sort_order = parsed.data.sortOrder;
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;
  if (parsed.data.fields !== undefined) updates.fields = parsed.data.fields;
  if (parsed.data.characterData !== undefined) updates.character_data = parsed.data.characterData;
  if (parsed.data.zoneId !== undefined) updates.zone_id = parsed.data.zoneId;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("cards")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ card: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id } = await params;
  const supabase = await createSupabaseServer();

  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
