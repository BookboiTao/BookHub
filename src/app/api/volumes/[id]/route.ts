import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const patchVolumeSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchVolumeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.summary !== undefined) updates.summary = parsed.data.summary;
  if (parsed.data.sortOrder !== undefined) updates.sort_order = parsed.data.sortOrder;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("volumes")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ volume: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("volumes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
