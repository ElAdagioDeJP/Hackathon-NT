import { connection } from "next/server";
import { health } from "@/app/services/ai/llm";

type HealthResult = Awaited<ReturnType<typeof health>>;
type CachedHealth = { promise: Promise<{ extract: HealthResult; draft: HealthResult }>; checkedAt: string };

// Memoized for 60s so repeated GETs don't spend provider quota on /models.
const TTL_MS = 60_000;
const cache = ((globalThis as { __aiHealth?: { entry?: CachedHealth; expiresAt?: number } }).__aiHealth ??= {});

function getCached(now: number): CachedHealth {
  if (!cache.entry || (cache.expiresAt ?? 0) <= now) {
    const checkedAt = new Date(now).toISOString();
    const promise = Promise.all([health("extract"), health("draft")]).then(([extract, draft]) => ({
      extract,
      draft,
    }));
    promise.catch(() => {
      if (cache.entry?.promise === promise) cache.entry = undefined;
    });
    cache.entry = { promise, checkedAt };
    cache.expiresAt = now + TTL_MS;
  }
  return cache.entry;
}

export async function GET() {
  await connection();
  const { promise, checkedAt } = getCached(Date.now());
  const { extract, draft } = await promise;
  return Response.json({
    extract,
    draft,
    gpu: process.env.AMD_GPU_LABEL ?? null,
    checkedAt,
  });
}
