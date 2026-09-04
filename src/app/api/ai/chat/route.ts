import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { callAI } from "@/lib/ai/provider-clients";
import { buildMessages, type Scope } from "@/lib/ai/context-builder";
import { checkProse } from "@/lib/ai/guard";
import { z } from "zod";

const chatSchema = z.object({
  bookId: z.string(),
  scope: z.object({
    type: z.enum(["tab", "editor", "card", "overview"]),
    bookId: z.string(),
    tab: z.string().optional(),
    chapterId: z.string().optional(),
    cardId: z.string().optional(),
  }),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })),
});

export async function POST(req: NextRequest) {
  const userOr401 = await requireUser();
  if (userOr401 instanceof Response) return userOr401;

  const body = await req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { bookId, scope: rawScope, messages } = parsed.data;

  // Build the scope object
  const scope: Scope = {
    type: rawScope.type,
    bookId,
    ...(rawScope.tab ? { tab: rawScope.tab } : {}),
    ...(rawScope.chapterId ? { chapterId: rawScope.chapterId } : {}),
    ...(rawScope.cardId ? { cardId: rawScope.cardId } : {}),
  } as Scope;

  // Assemble context + messages
  const { system, messages: fullMessages, contextLayers } = await buildMessages(scope, messages);

  // Call the AI
  const response = await callAI({
    system,
    messages: fullMessages,
    temperature: 0.7,
    maxTokens: 2000,
  });

  // Run guard on AI output
  const violations = checkProse(response.text);

  return NextResponse.json({
    text: response.text,
    meta: {
      provider: response.provider,
      model: response.model,
      usage: response.usage,
      contextLayers,
    },
    guard: violations.length > 0 ? violations : undefined,
  });
}
