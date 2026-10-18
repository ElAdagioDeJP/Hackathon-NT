import { evolusErrorResponse } from "@/app/services/ai/evolusBlocks";
import { evolusChat } from "@/app/services/ai/evolus";
import { authorizeProfileRequest } from "@/app/services/business/session";
import { FileApiError } from "@/app/services/files/errors";
import { chatLimiter, clientIp, RateLimitError } from "@/app/services/limits/rate-limit";

const MAX_MESSAGE = 4000;

// POST { message, conversationId?, businessRecordId? } → Evolus "Gara Facile Assistant" agent (BYOM Gemma on AMD).
// The agent answers from the company knowledge library; it never decides eligibility.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    conversationId?: unknown;
    businessRecordId?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE)
    return Response.json(
      { error: `message is required (max ${MAX_MESSAGE} characters).` },
      { status: 400 },
    );
  const conversationId =
    typeof body?.conversationId === "string" && body.conversationId ? body.conversationId : undefined;
  const { businessRecordId } = body ?? {};
  if (
    businessRecordId !== undefined &&
    !(Number.isSafeInteger(businessRecordId) && (businessRecordId as number) > 0)
  )
    return Response.json({ error: "businessRecordId must be a positive integer." }, { status: 400 });
  const id = businessRecordId as number | undefined;
  const key = `chat:${id ? `record:${id}` : `ip:${clientIp(request.headers)}`}`;
  try {
    if (id) await authorizeProfileRequest(request, id);
    const result = await chatLimiter.run(key, () =>
      evolusChat([{ role: "user", content: message }], conversationId),
    );
    return Response.json({ answer: result.content, conversationId: result.conversationId });
  } catch (error) {
    if (error instanceof FileApiError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof RateLimitError)
      return Response.json(
        { error: error.message },
        { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
      );
    return evolusErrorResponse(error);
  }
}
