import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { connection } from "next/server";
import { AnalyzeError, FIXTURES_DIR, loadFixture } from "@/app/services/ai/analyze";
import {
  compareExtractions,
  evolusErrorResponse,
  extractWithEvolus,
  type EvolusRequirement,
} from "@/app/services/ai/evolusBlocks";
import type { Requirement } from "@/app/services/ai/types";
import { authorizeProfileRequest } from "@/app/services/business/session";
import { FileApiError } from "@/app/services/files/errors";
import { clientIp, evolusLimiter, RateLimitError } from "@/app/services/limits/rate-limit";

// The extractor spends Evolus credits and reading a tender PDF takes minutes (~2.5 min measured),
// so POST starts the job in the background and GET reports it. Results are cached per tender.
const CACHE_DIR = join(/*turbopackIgnore: true*/ process.cwd(), "var", "evolus");
// Pre-seeded extractions shipped with the repo so demos work without spending credits.
const FIXTURE_CACHE_DIR = join(/*turbopackIgnore: true*/ process.cwd(), "fixtures", "evolus");

type Job = { state: "running" | "failed"; error?: string; status?: number };
const jobs = ((globalThis as { __evolusExtractJobs?: Map<string, Job> }).__evolusExtractJobs ??=
  new Map<string, Job>());

function cacheFile(tenderId: string) {
  return join(CACHE_DIR, `extract-${tenderId}.json`);
}

async function readCache(tenderId: string): Promise<EvolusRequirement[] | null> {
  const cached = await readFile(cacheFile(tenderId), "utf8")
    .then((raw) => JSON.parse(raw) as EvolusRequirement[])
    .catch(() => null);
  if (cached) return cached;
  return readFile(join(FIXTURE_CACHE_DIR, `extract-${tenderId}.json`), "utf8")
    .then((raw) => JSON.parse(raw) as EvolusRequirement[])
    .catch(() => null);
}

async function done(tenderId: string, evolus: EvolusRequirement[]) {
  const ours = JSON.parse(
    await readFile(join(FIXTURES_DIR, `${tenderId}.requirements.json`), "utf8"),
  ) as { requirements: Requirement[] };
  return Response.json({
    status: "done",
    tenderId,
    evolus,
    comparison: compareExtractions(ours.requirements, evolus),
  });
}

function status(tenderId: string) {
  const job = jobs.get(tenderId);
  if (job?.state === "failed")
    return Response.json(
      { status: "failed", tenderId, error: job.error },
      { status: job.status ?? 502 },
    );
  return Response.json({ status: job ? "running" : "none", tenderId }, { status: job ? 202 : 200 });
}

function parseId(value: unknown) {
  return typeof value === "string" && /^[\w-]{1,60}$/.test(value) ? value : null;
}

// GET ?tenderId=… → "done" with the comparison, "running" (202), "failed", or "none".
export async function GET(request: Request) {
  await connection();
  const tenderId = parseId(new URL(request.url).searchParams.get("tenderId"));
  if (!tenderId) return Response.json({ error: "tenderId is required." }, { status: 400 });
  try {
    const cached = await readCache(tenderId);
    if (cached) return await done(tenderId, cached);
    return status(tenderId);
  } catch (error) {
    if (error instanceof AnalyzeError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

// POST { tenderId, refresh?, businessRecordId? } → starts the Evolus extractor on the tender PDF (202), or returns the cache.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tenderId?: unknown;
    refresh?: unknown;
    businessRecordId?: unknown;
  } | null;
  const requested = parseId(body?.tenderId);
  if (!requested) return Response.json({ error: "tenderId is required." }, { status: 400 });
  const { businessRecordId } = body ?? {};
  if (
    businessRecordId !== undefined &&
    !(Number.isSafeInteger(businessRecordId) && (businessRecordId as number) > 0)
  )
    return Response.json({ error: "businessRecordId must be a positive integer." }, { status: 400 });
  const id = businessRecordId as number | undefined;
  const key = `evolus:${id ? `record:${id}` : `ip:${clientIp(request.headers)}`}`;
  try {
    if (id) await authorizeProfileRequest(request, id);
    const { fixture, bytes } = await loadFixture(requested);
    const tenderId = fixture.tenderId;
    if (body?.refresh !== true) {
      const cached = await readCache(tenderId);
      if (cached) return await done(tenderId, cached);
    }
    if (jobs.get(tenderId)?.state === "running") return status(tenderId);

    // Only a genuinely new job spends credits, so only it counts against the limiter.
    return await evolusLimiter.run(key, async () => {
      jobs.set(tenderId, { state: "running" });
      void extractWithEvolus(bytes, fixture.pdf, { timeoutMs: 600_000 })
        .then(async (items) => {
          await mkdir(CACHE_DIR, { recursive: true });
          await writeFile(cacheFile(tenderId), JSON.stringify(items, null, 2));
          jobs.delete(tenderId);
        })
        .catch(async (error: unknown) => {
          const response = (() => {
            try {
              return evolusErrorResponse(error);
            } catch {
              return null;
            }
          })();
          let safe = "Extraction failed.";
          if (response) {
            try {
              const payload = (await response.json()) as { error?: unknown };
              if (typeof payload.error === "string" && payload.error) safe = payload.error;
            } catch {
              // Keep the default safe message.
            }
          }
          if (response === null) {
            console.error({
              errorType: error instanceof Error ? error.name : "UnknownError",
              message: error instanceof Error ? error.message : "unknown",
            });
          }
          jobs.set(tenderId, {
            state: "failed",
            error: safe,
            status: response?.status,
          });
        });
      return status(tenderId);
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
