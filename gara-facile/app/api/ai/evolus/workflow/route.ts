import { AnalyzeError, loadFixture } from "@/app/services/ai/analyze";
import { evolusErrorResponse, startTenderWorkflow } from "@/app/services/ai/evolusBlocks";

// POST { tenderId } → queues the Evolus "Tender intake" workflow (extractor → assistant → output).
// Poll GET /api/ai/evolus/workflow/{executionId} for the result.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { tenderId?: unknown } | null;
  if (typeof body?.tenderId !== "string")
    return Response.json({ error: "tenderId is required." }, { status: 400 });
  try {
    const { fixture, bytes } = await loadFixture(body.tenderId);
    const run = await startTenderWorkflow(
      bytes,
      fixture.pdf,
      `Tender ${fixture.tenderId}: ${fixture.title}`,
    );
    return Response.json({ tenderId: fixture.tenderId, ...run }, { status: 202 });
  } catch (error) {
    if (error instanceof AnalyzeError)
      return Response.json({ error: error.message }, { status: error.status });
    return evolusErrorResponse(error);
  }
}
