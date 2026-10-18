/*
Example GET /api/ai/amd-stats response:
{
  "gpu": "AMD Radeon Cloud · Token Factory",
  "models": [
    { "role": "extract", "model": "Gemma-4-31B-IT" },
    { "role": "draft", "model": "Gemma-4-31B-IT" }
  ],
  "totals": { "calls": 42, "ok": 40, "errors": 2, "promptTokens": 120500, "completionTokens": 18230 },
  "byRole": {
    "extract": { "calls": 30, "avgMs": 4200, "p50Ms": 3900, "p95Ms": 8100, "tokensPerSecond": 18.5 },
    "draft": { "calls": 12, "avgMs": 9600, "p50Ms": 9100, "p95Ms": 15000, "tokensPerSecond": 9.2 }
  },
  "last": { "role": "draft", "model": "Gemma-4-31B-IT", "ms": 9400, "tokensPerSecond": 9.6, "at": "2026-10-17T12:00:00.000Z" },
  "recent": [
    { "role": "draft", "model": "Gemma-4-31B-IT", "ms": 9400, "ok": true, "completionTokens": 90, "at": "2026-10-17T12:00:00.000Z" }
  ]
}
*/
import { connection } from "next/server";
import { getAmdStats } from "@/app/services/ai/amdStats";

export async function GET() {
  // Aggregate over ai_runs only: never prerender or cache, never call a provider.
  await connection();
  return Response.json(await getAmdStats());
}
