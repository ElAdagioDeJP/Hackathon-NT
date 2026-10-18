// Aggregate stats over ai_runs for the AMD panel (GET /api/ai/amd-stats).
// summarizeRuns is pure (unit-tested); getAmdStats reads the DB. Error texts
// stored on failed rows are never surfaced, and model info comes only from
// env via endpointFor — API keys and base URLs are never included.
import { desc } from "drizzle-orm";
import { aiRuns } from "../../db/schema";
import { endpointFor } from "./llm";
import type { LlmRole } from "./types";

const MAX_ROWS = 1000;
const RECENT_LIMIT = 10;
const ROLES: readonly LlmRole[] = ["extract", "draft"];

// One ai_runs row. `error` is accepted (drizzle selects it) but never read.
export interface AmdRunRow {
  role: string;
  model: string;
  ms: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  ok: boolean;
  error?: string | null;
  createdAt: Date | string | number;
}

export interface RoleStats {
  calls: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  tokensPerSecond: number;
}

export interface AmdStats {
  gpu: string;
  models: { role: LlmRole; model: string }[];
  totals: {
    calls: number;
    ok: number;
    errors: number;
    promptTokens: number;
    completionTokens: number;
  };
  byRole: Partial<Record<LlmRole, RoleStats>>;
  last: {
    role: string;
    model: string;
    ms: number;
    tokensPerSecond: number;
    at: string;
  } | null;
  recent: {
    role: string;
    model: string;
    ms: number;
    ok: boolean;
    completionTokens: number | null;
    at: string;
  }[];
}

type Env = Record<string, string | undefined>;

function toIso(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function toTime(value: Date | string | number): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// Nearest-rank percentile over integer ms values.
function percentile(sortedMs: number[], q: number): number {
  if (sortedMs.length === 0) return 0;
  return sortedMs[Math.max(0, Math.ceil(q * sortedMs.length) - 1)];
}

// Aggregate throughput: total completion tokens over total seconds, counting
// only ok rows that report completion tokens with a positive duration.
function throughput(rows: AmdRunRow[]): number {
  let tokens = 0;
  let seconds = 0;
  for (const row of rows) {
    if (!row.ok) continue;
    const completion = row.completionTokens ?? 0;
    if (!completion || completion <= 0 || !row.ms || row.ms <= 0) continue;
    tokens += completion;
    seconds += row.ms / 1000;
  }
  if (tokens === 0 || seconds === 0) return 0;
  return Math.round((tokens / seconds) * 100) / 100;
}

function rateOf(row: AmdRunRow): number {
  return throughput([row]);
}

// Configured { role, model } pairs. Roles whose env is missing are skipped;
// endpointFor throws for those, which is how we detect "not configured".
// Only role and model are kept — never apiKey or baseUrl.
function configuredModels(env: Env): { role: LlmRole; model: string }[] {
  const models: { role: LlmRole; model: string }[] = [];
  for (const role of ROLES) {
    try {
      models.push({ role, model: endpointFor(role, env).model });
    } catch {
      // Role not configured: omit it rather than failing the whole panel.
    }
  }
  return models;
}

function summarizeRole(rows: AmdRunRow[]): RoleStats {
  const ms = rows.map((row) => row.ms).sort((a, b) => a - b);
  const total = ms.reduce((sum, value) => sum + value, 0);
  return {
    calls: rows.length,
    avgMs: rows.length === 0 ? 0 : Math.round(total / rows.length),
    p50Ms: percentile(ms, 0.5),
    p95Ms: percentile(ms, 0.95),
    tokensPerSecond: throughput(rows),
  };
}

export function summarizeRuns(rows: AmdRunRow[], env: Env = process.env): AmdStats {
  const ordered = [...rows].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
  const ok = rows.filter((row) => row.ok).length;
  const byRole: Partial<Record<LlmRole, RoleStats>> = {};
  for (const role of ROLES) {
    const roleRows = rows.filter((row) => row.role === role);
    if (roleRows.length > 0) byRole[role] = summarizeRole(roleRows);
  }
  const newest = ordered[0] ?? null;
  return {
    gpu: env.AMD_GPU_LABEL ?? "AMD",
    models: configuredModels(env),
    totals: {
      calls: rows.length,
      ok,
      errors: rows.length - ok,
      promptTokens: rows.reduce((sum, row) => sum + (row.promptTokens ?? 0), 0),
      completionTokens: rows.reduce((sum, row) => sum + (row.completionTokens ?? 0), 0),
    },
    byRole,
    last: newest
      ? {
          role: newest.role,
          model: newest.model,
          ms: newest.ms,
          tokensPerSecond: rateOf(newest),
          at: toIso(newest.createdAt),
        }
      : null,
    recent: ordered.slice(0, RECENT_LIMIT).map((row) => ({
      role: row.role,
      model: row.model,
      ms: row.ms,
      ok: row.ok,
      completionTokens: row.completionTokens ?? null,
      at: toIso(row.createdAt),
    })),
  };
}

export async function getAmdStats(env: Env = process.env): Promise<AmdStats> {
  if (!process.env.DB_FILE_NAME) return summarizeRuns([], env);
  const { db } = await import("../../db");
  const rows = await db
    .select()
    .from(aiRuns)
    .orderBy(desc(aiRuns.createdAt))
    .limit(MAX_ROWS);
  return summarizeRuns(rows, env);
}
