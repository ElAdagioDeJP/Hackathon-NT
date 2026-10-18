import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import { AnalyzeError, FIXTURES_DIR } from "@/app/services/ai/analyze";
import { generateDraft } from "@/app/services/ai/draft";
import { LlmError } from "@/app/services/ai/llm";
import { getCompanyFacts } from "@/app/services/ai/profileFacts";
import type { Requirement, TenderAnalysis } from "@/app/services/ai/types";
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
  // One draft keeps the shared GPU busy: reuse the analysis limiter under a
  // separate "draft:" key so drafts and analyses do not block each other.
  const key = `draft:${id ? `record:${id}` : `ip:${clientIp(request.headers)}`}`;
  try {
    // A real profile is only drafted for the browser session that owns it.
    if (id) await authorizeProfileRequest(request, id);
    return await analyzeLimiter.run(key, async () => {
      if (!/^[\w.-]+$/.test(tenderId)) throw new AnalyzeError("Invalid tenderId.");
      if (!process.env.DB_FILE_NAME) throw new AnalyzeError("Drafts are not configured.", 503);
      const { db } = await import("@/app/db");
      const { tenderAnalyses } = await import("@/app/db/schema");
      const row = db
        .select()
        .from(tenderAnalyses)
        .where(
          id === undefined
            ? and(eq(tenderAnalyses.tenderId, tenderId), isNull(tenderAnalyses.businessRecordId))
            : and(eq(tenderAnalyses.tenderId, tenderId), eq(tenderAnalyses.businessRecordId, id)),
        )
        .orderBy(desc(tenderAnalyses.id))
        .limit(1)
        .get();
      if (!row) throw new AnalyzeError("Run the analysis first.", 404);
      const analysis = row.analysis as TenderAnalysis;
      // Never re-extract: reuse the requirements saved with the extraction prompt.
      const raw = await readFile(join(FIXTURES_DIR, `${tenderId}.requirements.json`), "utf8").catch(() => {
        throw new AnalyzeError(`Requirements for tender ${tenderId} not found.`, 404);
      });
      let requirements: Requirement[];
      try {
        const parsed = JSON.parse(raw) as { requirements?: unknown };
        if (!parsed || !Array.isArray(parsed.requirements)) throw new Error("unreadable");
        requirements = parsed.requirements as Requirement[];
      } catch {
        throw new AnalyzeError(`Requirements for tender ${tenderId} are unreadable.`, 500);
      }
      // No profile → demo company (fixtures/company/demo-company.json).
      const company = await getCompanyFacts(id);
      const draft = await generateDraft({
        analysis,
        requirements,
        company,
        signal: request.signal,
      });
      return Response.json(draft);
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
    // Never leak the provider body: the LLM error carries status and payload.
    if (error instanceof LlmError)
      return Response.json(
        { error: "The draft model is temporarily unavailable. Try again later." },
        { status: 502 },
      );
    throw error;
  }
}
