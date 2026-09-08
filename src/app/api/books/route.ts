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

  const books = data ?? [];
  const bookIds = books.map((b) => b.id as string);

  // The books table doesn't store word/chapter/branch counts itself — derive
  // them here so "My Books" and the book overview page show real numbers
  // instead of always reading 0.
  const wordsByBook: Record<string, number> = {};
  const chapterCountByBook: Record<string, number> = {};
  const branchCountByBook: Record<string, number> = {};

  if (bookIds.length > 0) {
    const [{ data: chapterRows }, { data: branchRows }] = await Promise.all([
      supabase.from("chapters").select("book_id, content").in("book_id", bookIds),
      supabase.from("branches").select("book_id").in("book_id", bookIds),
    ]);

    for (const c of chapterRows ?? []) {
      const bookId = c.book_id as string;
      const content = (c.content as string) ?? "";
      const words = content.trim() ? content.trim().split(/\s+/).length : 0;
      wordsByBook[bookId] = (wordsByBook[bookId] ?? 0) + words;
      chapterCountByBook[bookId] = (chapterCountByBook[bookId] ?? 0) + 1;
    }
    for (const b of branchRows ?? []) {
      const bookId = b.book_id as string;
      branchCountByBook[bookId] = (branchCountByBook[bookId] ?? 0) + 1;
    }
  }

  const enriched = books.map((b) => ({
    ...b,
    total_words: wordsByBook[b.id as string] ?? 0,
    chapter_count: chapterCountByBook[b.id as string] ?? 0,
    branch_count: branchCountByBook[b.id as string] ?? 0,
  }));

  return NextResponse.json({ books: enriched });
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
