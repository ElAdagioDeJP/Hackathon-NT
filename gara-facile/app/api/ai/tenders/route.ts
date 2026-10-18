import { connection } from "next/server";
import { AnalyzeError, FIXTURES_DIR } from "@/app/services/ai/analyze";
import { latestAnalyses, listTenders } from "@/app/services/ai/tenders";
import { authorizeProfileRequest } from "@/app/services/business/session";
import { FileApiError } from "@/app/services/files/errors";

export async function GET(request: Request) {
  await connection();
  const raw = new URL(request.url).searchParams.get("businessRecordId");
  let id: number | null = null;
  if (raw !== null) {
    if (!/^[1-9]\d*$/.test(raw)) return Response.json({ error: "businessRecordId must be a positive integer." }, { status: 400 });
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed))
      return Response.json({ error: "businessRecordId must be a positive integer." }, { status: 400 });
    id = parsed;
  }
  try {
    // A real profile only sees its own analyses.
    if (id !== null) await authorizeProfileRequest(request, id);
    const summaries = await listTenders(FIXTURES_DIR);
    if (!process.env.DB_FILE_NAME)
      return Response.json({
        tenders: summaries.map((tender) => ({ ...tender, analysis: null, analyzedAt: null })),
      });
    const { db } = await import("@/app/db");
    const latest = latestAnalyses(
      db,
      summaries.map((tender) => tender.id),
      id,
    );
    return Response.json({
      tenders: summaries.map((tender) => ({ ...tender, ...latest[tender.id] })),
    });
  } catch (error) {
    if (error instanceof FileApiError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof AnalyzeError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Could not load tenders. Try again later." }, { status: 500 });
  }
}
