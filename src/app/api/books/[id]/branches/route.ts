import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/supabase-server";
import { z } from "zod";

const createBranchSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().default(false),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const { id: bookId } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ branches: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;
  const user = userOr401;

  const { id: bookId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createBranchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("branches")
    .insert({
      book_id: bookId,
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      is_default: parsed.data.isDefault,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ branch: data });
}
