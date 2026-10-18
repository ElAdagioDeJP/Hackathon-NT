import { evolusErrorResponse } from "@/app/services/ai/evolusBlocks";
import { evolusChat } from "@/app/services/ai/evolus";

const MAX_MESSAGE = 4000;

// POST { message, conversationId? } → Evolus "Gara Facile Assistant" agent (BYOM Gemma on AMD).
// The agent answers from the company knowledge library; it never decides eligibility.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    conversationId?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE)
    return Response.json(
      { error: `message is required (max ${MAX_MESSAGE} characters).` },
      { status: 400 },
    );
  const conversationId =
    typeof body?.conversationId === "string" && body.conversationId ? body.conversationId : undefined;
  try {
    const result = await evolusChat([{ role: "user", content: message }], conversationId);
    return Response.json({ answer: result.content, conversationId: result.conversationId });
  } catch (error) {
    return evolusErrorResponse(error);
  }
}
