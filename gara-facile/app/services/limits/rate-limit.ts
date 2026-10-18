// In-process limits for the actions that spend TED, Evolus or GPU time.
// The app runs as one server instance (Docker/Dokploy); several instances
// would need a shared store instead of these maps.

export class RateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export interface LimiterOptions {
  max: number; // runs per key inside the window
  windowMs: number;
  concurrent: number; // runs in flight across all keys
  now?: () => number;
}

export function createLimiter({ max, windowMs, concurrent, now = Date.now }: LimiterOptions) {
  const hits = new Map<string, number[]>();
  const running = new Set<string>();

  return {
    async run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      if (running.has(key))
        throw new RateLimitError("A request is already running. Wait for it to finish.", 5);
      if (recent.length >= max) {
        const retry = Math.ceil((recent[0] + windowMs - t) / 1000);
        throw new RateLimitError(
          `Too many requests. Try again in ${Math.ceil(retry / 60)} minute${retry > 60 ? "s" : ""}.`,
          retry,
        );
      }
      if (running.size >= concurrent)
        throw new RateLimitError("The server is busy. Try again in a minute.", 60);
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 10_000)
        for (const [k, times] of hits)
          if (times.every((at) => t - at >= windowMs)) hits.delete(k);
      running.add(key);
      try {
        return await task();
      } finally {
        running.delete(key);
      }
    },
  };
}

// The first X-Forwarded-For hop is set by the reverse proxy in front of the app.
export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

// Find matches: one TED search + one Evolus chat per run.
export const matchLimiter = createLimiter({ max: 5, windowMs: 10 * 60_000, concurrent: 4 });
// Tender analysis: several LLM calls on the shared GPU per run.
export const analyzeLimiter = createLimiter({ max: 10, windowMs: 10 * 60_000, concurrent: 2 });
// Evolus assistant chat: one agent call per message.
export const chatLimiter = createLimiter({ max: 20, windowMs: 10 * 60_000, concurrent: 4 });
// Evolus extractor and workflow runs read a whole tender PDF and spend credits.
export const evolusRunLimiter = createLimiter({ max: 3, windowMs: 60 * 60_000, concurrent: 2 });

export function tooManyRequests(error: RateLimitError) {
  return Response.json(
    { error: error.message },
    { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
  );
}
