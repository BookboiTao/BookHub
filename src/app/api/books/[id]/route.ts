import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const patchBookSchema = z.object({
  title: z.string().min(1).optional(),
  genre: z.string().nullable().optional(),
  blurb: z.string().nullable().optional(),
  visibility: z.enum(["public", "private"]).optional(),
  worldSummaryTitle: z.string().nullable().optional(),
  worldSummaryBody: z.string().nullable().optional(),
  workshopNotes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ book: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchBookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // map camelCase → snake_case
  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.genre !== undefined) updates.genre = parsed.data.genre;
  if (parsed.data.blurb !== undefined) updates.blurb = parsed.data.blurb;
  if (parsed.data.visibility !== undefined) updates.visibility = parsed.data.visibility;
  if (parsed.data.worldSummaryTitle !== undefined) updates.world_summary_title = parsed.data.worldSummaryTitle;
  if (parsed.data.worldSummaryBody !== undefined) updates.world_summary_body = parsed.data.worldSummaryBody;
  if (parsed.data.workshopNotes !== undefined) updates.workshop_notes = parsed.data.workshopNotes;
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("books")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ book: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id } = await params;
  const supabase = await createSupabaseServer();

  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
