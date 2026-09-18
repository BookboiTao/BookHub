/* ------------------------------------------------------------------ *
 * tool-executors.ts — SERVER-ONLY. Runs the two read-only tools
 * (search_bible, get_card) against Supabase. Write tools (create_card,
 * update_card, create_link) have no executor here on purpose — see
 * tools.ts's header comment for why.
 * ------------------------------------------------------------------ */

import { createSupabaseServer } from "@/lib/supabase-server";

export async function executeReadTool(
  name: string,
  args: Record<string, unknown>,
  bookId: string,
): Promise<string> {
  const supabase = await createSupabaseServer();

  if (name === "search_bible") {
    const query = String(args.query ?? "").trim();
    const category = typeof args.category === "string" ? args.category : undefined;
    if (!query) return JSON.stringify({ error: "query is required" });

    let q = supabase
      .from("cards")
      .select("id, category, title, summary, canon_status")
      .eq("book_id", bookId)
      .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
      .limit(8);
    if (category) q = q.eq("category", category);

    const { data, error } = await q;
    if (error) return JSON.stringify({ error: error.message });
    if (!data || data.length === 0) {
      return JSON.stringify({ results: [], note: "No matching cards. Don't assume it exists -- propose create_card if the person asked for something new." });
    }
    return JSON.stringify({
      results: data.map((c) => ({
        id: c.id,
        category: c.category,
        title: c.title,
        summary: c.summary,
        status: c.canon_status,
      })),
    });
  }

  if (name === "get_card") {
    const cardId = String(args.cardId ?? "");
    if (!cardId) return JSON.stringify({ error: "cardId is required" });

    const { data, error } = await supabase
      .from("cards")
      .select("id, category, title, summary, body, tags, fields, canon_status")
      .eq("id", cardId)
      .eq("book_id", bookId)
      .maybeSingle();

    if (error) return JSON.stringify({ error: error.message });
    if (!data) return JSON.stringify({ error: "Card not found in this book." });
    return JSON.stringify({
      id: data.id,
      category: data.category,
      title: data.title,
      summary: data.summary,
      body: data.body,
      tags: data.tags,
      fields: data.fields,
      status: data.canon_status,
    });
  }

  return JSON.stringify({ error: `Unknown read tool: ${name}` });
}
