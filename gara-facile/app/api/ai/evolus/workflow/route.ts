import { AnalyzeError, loadFixture } from "@/app/services/ai/analyze";
import { evolusErrorResponse, startTenderWorkflow } from "@/app/services/ai/evolusBlocks";
import { authorizeProfileRequest } from "@/app/services/business/session";
import { FileApiError } from "@/app/services/files/errors";
import { clientIp, evolusLimiter, RateLimitError } from "@/app/services/limits/rate-limit";

// POST { tenderId, businessRecordId? } → queues the Evolus "Tender intake" workflow (extractor → assistant → output).
// Poll GET /api/ai/evolus/workflow/{executionId} for the result.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tenderId?: unknown;
    businessRecordId?: unknown;
  } | null;
  if (typeof body?.tenderId !== "string")
    return Response.json({ error: "tenderId is required." }, { status: 400 });
  const { businessRecordId } = body;
  if (
    businessRecordId !== undefined &&
    !(Number.isSafeInteger(businessRecordId) && (businessRecordId as number) > 0)
  )
    return Response.json({ error: "businessRecordId must be a positive integer." }, { status: 400 });
  const id = businessRecordId as number | undefined;
  const key = `evolus:${id ? `record:${id}` : `ip:${clientIp(request.headers)}`}`;
  try {
    if (id) await authorizeProfileRequest(request, id);
    return await evolusLimiter.run(key, async () => {
      const { fixture, bytes } = await loadFixture(body.tenderId as string);
      const run = await startTenderWorkflow(
        bytes,
        fixture.pdf,
        `Tender ${fixture.tenderId}: ${fixture.title}`,
      );
      return Response.json({ tenderId: fixture.tenderId, ...run }, { status: 202 });
    });
  } catch (error) {
    if (error instanceof FileApiError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof RateLimitError)
      return Response.json(
        { error: error.message },
        { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
      );
    if (error instanceof AnalyzeError)
      return Response.json({ error: error.message }, { status: error.status });
    return evolusErrorResponse(error);
  }
}
