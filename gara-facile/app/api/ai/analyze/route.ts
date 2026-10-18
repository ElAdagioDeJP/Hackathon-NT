import { AnalyzeError, analyzeTender, saveAnalysis } from "@/app/services/ai/analyze";
import { LlmError } from "@/app/services/ai/llm";
import { getCompanyFacts } from "@/app/services/ai/profileFacts";
import { authorizeProfileRequest } from "@/app/services/business/session";
import { FileApiError } from "@/app/services/files/errors";
import { analyzeLimiter, clientIp, RateLimitError } from "@/app/services/limits/rate-limit";

export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tenderId?: unknown;
    businessRecordId?: unknown;
  } | null;
  if (!body || typeof body.tenderId !== "string")
    return Response.json({ error: "tenderId is required." }, { status: 400 });
  const { businessRecordId } = body;
  if (
    businessRecordId !== undefined &&
    !(Number.isSafeInteger(businessRecordId) && (businessRecordId as number) > 0)
  )
    return Response.json({ error: "businessRecordId must be a positive integer." }, { status: 400 });
  const id = businessRecordId as number | undefined;
  const tenderId = body.tenderId;
  // One analysis keeps the shared GPU busy: limit it per profile, or per
  // client address for the demo company.
  const key = id ? `record:${id}` : `ip:${clientIp(request.headers)}`;
  try {
    // A real profile is only analyzed for the browser session that owns it.
    if (id) await authorizeProfileRequest(request, id);
    return await analyzeLimiter.run(key, async () => {
      // No profile → demo company (fixtures/company/demo-company.json).
      const company = await getCompanyFacts(id);
      const { analysis, requirements, stats } = await analyzeTender({
        tenderId,
        company,
        signal: request.signal,
      });
      await saveAnalysis(analysis, id);
      return Response.json({ analysis, requirements, stats });
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
    if (error instanceof LlmError)
      return Response.json({ error: error.message }, { status: 502 });
    throw error;
  }
}
