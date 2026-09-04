import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const reorderSchema = z.object({
  order: z.array(z.object({ id: z.string(), sortOrder: z.number() })),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: bookId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  // Update each chapter's sort_order individually.
  // RLS ensures only the owner's chapters are affected.
  const updates = parsed.data.order.map((item) =>
    supabase
      .from("chapters")
      .update({ sort_order: item.sortOrder })
      .eq("id", item.id)
      .eq("book_id", bookId),
  );
  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error);
  if (firstError?.error) {
    return NextResponse.json({ error: firstError.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
