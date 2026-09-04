import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const createLinkSchema = z.object({
  fromCardId: z.string().min(1),
  toCardId: z.string().min(1),
  label: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const { id: bookId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("card_links")
    .insert({
      user_id: user.id,
      from_card_id: parsed.data.fromCardId,
      to_card_id: parsed.data.toCardId,
      label: parsed.data.label,
    })
    .select()
    .single();

  void bookId;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: data });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: bookId } = await params;
  const supabase = await createSupabaseServer();

  const { data: cards } = await supabase
    .from("cards")
    .select("id")
    .eq("book_id", bookId);
  const cardIds = (cards ?? []).map((c) => c.id);
  if (cardIds.length === 0) return NextResponse.json({ links: [] });

  const { data, error } = await supabase
    .from("card_links")
    .select("*")
    .in("from_card_id", cardIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ links: data ?? [] });
}
