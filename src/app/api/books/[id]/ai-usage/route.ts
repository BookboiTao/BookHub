import { NextRequest, NextResponse } from "next/server";
import { requireUser, createSupabaseServer } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: bookId } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("ai_usage")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ usage: data ?? [] });
}
