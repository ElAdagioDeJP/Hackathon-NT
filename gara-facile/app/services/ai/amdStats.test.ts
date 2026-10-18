import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeRuns, type AmdRunRow } from "./amdStats";

const env = {
  AMD_GPU_LABEL: "Test GPU",
  LLM_EXTRACT_BASE_URL: "http://extract:8000/v1",
  LLM_EXTRACT_MODEL: "extract-model",
  LLM_EXTRACT_API_KEY: "extract-secret",
  LLM_DRAFT_BASE_URL: "http://draft:8000/v1",
  LLM_DRAFT_MODEL: "draft-model",
  LLM_DRAFT_API_KEY: "draft-secret",
};

function row(overrides: Partial<AmdRunRow> & { createdAt: AmdRunRow["createdAt"] }): AmdRunRow {
  return {
    role: "extract",
    model: "extract-model",
    ms: 1000,
    promptTokens: 10,
    completionTokens: 20,
    ok: true,
    ...overrides,
  };
}

const rows: AmdRunRow[] = [
  row({ ms: 1000, promptTokens: 100, completionTokens: 20, createdAt: "2026-10-17T10:00:00.000Z" }),
  row({ ms: 2000, promptTokens: 200, completionTokens: 60, createdAt: "2026-10-17T11:00:00.000Z" }),
  row({
    role: "draft",
    model: "draft-model",
    ms: 4000,
    promptTokens: 300,
    completionTokens: 40,
    createdAt: "2026-10-17T12:00:00.000Z",
  }),
  row({
    role: "draft",
    model: "draft-model",
    ms: 500,
    promptTokens: 50,
    completionTokens: null,
    ok: false,
    error: "HTTP 503: upstream exploded",
    createdAt: "2026-10-17T09:00:00.000Z",
  }),
];

test("totals count calls, ok/errors and token sums", () => {
  const stats = summarizeRuns(rows, env);
  assert.deepEqual(stats.totals, {
    calls: 4,
    ok: 3,
    errors: 1,
    promptTokens: 650,
    completionTokens: 120,
  });
});

test("byRole reports avg, p50, p95 and tokens per second", () => {
  const stats = summarizeRuns(rows, env);
  assert.deepEqual(stats.byRole.extract, {
    calls: 2,
    avgMs: 1500,
    p50Ms: 1000,
    p95Ms: 2000,
    // (20 + 60) tokens over (1 + 2) s.
    tokensPerSecond: 26.67,
  });
  assert.deepEqual(stats.byRole.draft, {
    calls: 2,
    avgMs: 2250,
    p50Ms: 500,
    p95Ms: 4000,
    // Only the ok row with completion tokens counts: 40 tokens over 4 s.
    tokensPerSecond: 10,
  });
});

test("last is the newest run and recent is newest-first", () => {
  const stats = summarizeRuns([...rows].reverse(), env);
  assert.deepEqual(stats.last, {
    role: "draft",
    model: "draft-model",
    ms: 4000,
    tokensPerSecond: 10,
    at: "2026-10-17T12:00:00.000Z",
  });
  assert.deepEqual(
    stats.recent.map((run) => run.at),
    [
      "2026-10-17T12:00:00.000Z",
      "2026-10-17T11:00:00.000Z",
      "2026-10-17T10:00:00.000Z",
      "2026-10-17T09:00:00.000Z",
    ],
  );
});

test("error rows surface status only, never the error text", () => {
  const stats = summarizeRuns(rows, env);
  const failed = stats.recent.find((run) => !run.ok);
  assert.ok(failed);
  assert.equal(failed.completionTokens, null);
  assert.ok(!JSON.stringify(stats).includes("upstream exploded"));
});

test("models list has role and model only, no secrets", () => {
  const stats = summarizeRuns(rows, env);
  assert.deepEqual(stats.models, [
    { role: "extract", model: "extract-model" },
    { role: "draft", model: "draft-model" },
  ]);
  const dumped = JSON.stringify(stats.models);
  assert.ok(!dumped.includes("extract-secret"));
  assert.ok(!dumped.includes("draft-secret"));
  assert.ok(!dumped.includes("http://extract:8000"));
  assert.ok(!dumped.includes("http://draft:8000"));
});

test("empty input gives zeros, empty byRole and a null last", () => {
  const stats = summarizeRuns([], {});
  assert.equal(stats.gpu, "AMD");
  assert.deepEqual(stats.totals, { calls: 0, ok: 0, errors: 0, promptTokens: 0, completionTokens: 0 });
  assert.deepEqual(stats.byRole, {});
  assert.equal(stats.last, null);
  assert.deepEqual(stats.recent, []);
  assert.deepEqual(stats.models, []);
});

test("unconfigured roles are omitted from models, gpu falls back to AMD", () => {
  const stats = summarizeRuns([], {
    LLM_EXTRACT_BASE_URL: "http://extract:8000/v1",
    LLM_EXTRACT_MODEL: "extract-model",
  });
  assert.deepEqual(stats.models, [{ role: "extract", model: "extract-model" }]);
  assert.equal(stats.gpu, "AMD");
});

test("recent keeps only the newest 10 runs", () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    row({ ms: 1000 + i, createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, i)).toISOString() }),
  );
  const stats = summarizeRuns(many, env);
  assert.equal(stats.recent.length, 10);
  assert.equal(stats.recent[0].at, "2026-10-17T10:00:11.000Z");
  assert.equal(stats.totals.calls, 12);
});
