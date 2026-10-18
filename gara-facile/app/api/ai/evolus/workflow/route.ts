import { AnalyzeError, loadFixture } from "@/app/services/ai/analyze";
import { evolusErrorResponse, startTenderWorkflow } from "@/app/services/ai/evolusBlocks";
import {
  clientIp,
  evolusRunLimiter,
  RateLimitError,
  tooManyRequests,
} from "@/app/services/limits/rate-limit";

// POST { tenderId } → queues the Evolus "Tender intake" workflow (extractor → assistant → output).
// Poll GET /api/ai/evolus/workflow/{executionId} for the result.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { tenderId?: unknown } | null;
  if (typeof body?.tenderId !== "string")
    return Response.json({ error: "tenderId is required." }, { status: 400 });
  try {
    const { fixture, bytes } = await loadFixture(body.tenderId);
    // Each run reads the whole tender PDF on Evolus credits.
    const run = await evolusRunLimiter.run(`ip:${clientIp(request.headers)}`, () =>
      startTenderWorkflow(bytes, fixture.pdf, `Tender ${fixture.tenderId}: ${fixture.title}`),
    );
    return Response.json({ tenderId: fixture.tenderId, ...run }, { status: 202 });
  } catch (error) {
    if (error instanceof AnalyzeError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof RateLimitError) return tooManyRequests(error);
    return evolusErrorResponse(error);
  }
}
