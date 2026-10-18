import { evolusErrorResponse } from "@/app/services/ai/evolusBlocks";
import { evolusChat } from "@/app/services/ai/evolus";
import {
  chatLimiter,
  clientIp,
  RateLimitError,
  tooManyRequests,
} from "@/app/services/limits/rate-limit";

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
    // Public endpoint: every message spends an Evolus agent call.
    const result = await chatLimiter.run(`ip:${clientIp(request.headers)}`, () =>
      evolusChat([{ role: "user", content: message }], conversationId),
    );
    return Response.json({ answer: result.content, conversationId: result.conversationId });
  } catch (error) {
    if (error instanceof RateLimitError) return tooManyRequests(error);
    return evolusErrorResponse(error);
  }
}
