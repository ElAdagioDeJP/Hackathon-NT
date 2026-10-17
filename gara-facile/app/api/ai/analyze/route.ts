import { AnalyzeError, analyzeTender, saveAnalysis } from "@/app/services/ai/analyze";
import { DEMO_COMPANY } from "@/app/services/ai/mocks/demoCompany";
import { LlmError } from "@/app/services/ai/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tenderId?: unknown;
    businessRecordId?: unknown;
  } | null;
  if (!body || typeof body.tenderId !== "string")
    return Response.json({ error: "tenderId is required." }, { status: 400 });
  const businessRecordId =
    typeof body.businessRecordId === "number" ? body.businessRecordId : undefined;
  // TODO: resolve businessRecordId through ai/profileFacts.ts.
  const company = DEMO_COMPANY;
  try {
    const { analysis, requirements, stats } = await analyzeTender({
      tenderId: body.tenderId,
      company,
      signal: request.signal,
    });
    await saveAnalysis(analysis, businessRecordId);
    return Response.json({ analysis, requirements, stats });
  } catch (error) {
    if (error instanceof AnalyzeError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof LlmError)
      return Response.json({ error: error.message }, { status: 502 });
    throw error;
  }
}
