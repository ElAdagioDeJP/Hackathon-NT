import assert from "node:assert/strict";
import { test } from "node:test";
import { EvolusApiError, readEvolusConfig } from "../match/evolus";
import {
  compareExtractions,
  evolusErrorResponse,
  extractWithEvolus,
  getTenderWorkflowExecution,
  normalizeEvolusRequirements,
  startTenderWorkflow,
} from "./evolusBlocks";
import type { Requirement } from "./types";

const env = {
  EVOLUS_API_KEY: "test-key",
  EVOLUS_APP_ID: "app-1",
  EVOLUS_AGENT_ID: "agent-1",
  EVOLUS_EXTRACTOR_ID: "extractor-1",
  EVOLUS_WORKFLOW_ID: "workflow-1",
} as unknown as NodeJS.ProcessEnv;

function fakeFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function req(kind: Requirement["kind"], page: number): Requirement {
  return { id: `${kind}-${page}`, kind, description: kind, page, quote: "q", confidence: 1 };
}

test("matching agent uses EVOLUS_MATCH_AGENT_ID and falls back to EVOLUS_AGENT_ID", () => {
  const both = { ...env, EVOLUS_MATCH_AGENT_ID: "match-1" } as NodeJS.ProcessEnv;
  assert.equal(readEvolusConfig(both, "match").agentId, "match-1");
  assert.equal(readEvolusConfig(both).agentId, "agent-1");
  assert.equal(readEvolusConfig(env, "match").agentId, "agent-1");
  assert.throws(
    () => readEvolusConfig({ EVOLUS_API_KEY: "k", EVOLUS_APP_ID: "a" } as unknown as NodeJS.ProcessEnv, "match"),
    /EVOLUS_MATCH_AGENT_ID/,
  );
});

test("extractor posts the PDF to ask-file without webhook and normalizes the reply", async () => {
  const { calls, fetchImpl } = fakeFetch(
    Response.json({
      requirements: [
        { kind: "certification", description: "ISO 9001", value: "ISO 9001", page: 4, quote: "UNI EN ISO 9001" },
        { kind: "unknown_kind", description: "x", page: 2, quote: "x" },
        { kind: "bid_guarantee", description: "2%", page: 0, quote: "x" },
      ],
    }),
  );

  const items = await extractWithEvolus(pdf, "tender.pdf", { env, fetchImpl, log: () => {} });

  assert.equal(
    calls[0].url,
    "https://api.evolus.ai/api/v1/agents/agent-1/json/extractor-1/ask-file?useWebhook=false",
  );
  assert.equal(calls[0].init.method, "POST");
  assert.ok(calls[0].init.body instanceof FormData);
  assert.equal(new Headers(calls[0].init.headers).get("X-ApiKey"), "test-key");
  assert.deepEqual(items, [
    { kind: "certification", description: "ISO 9001", value: "ISO 9001", page: 4, quote: "UNI EN ISO 9001" },
  ]);
});

test("extractor path uses EVOLUS_EXTRACTOR_AGENT_ID when set", async () => {
  const { calls, fetchImpl } = fakeFetch(Response.json([]));
  const custom = { ...env, EVOLUS_EXTRACTOR_AGENT_ID: "ext-agent" } as NodeJS.ProcessEnv;
  await extractWithEvolus(pdf, "t.pdf", { env: custom, fetchImpl, log: () => {} });
  assert.match(calls[0].url, /\/agents\/ext-agent\/json\/extractor-1\/ask-file/);
});

test("normalizer accepts a bare array or a JSON string", () => {
  const item = { kind: "min_turnover", description: "t", value: 800000, page: 3, quote: "q" };
  assert.equal(normalizeEvolusRequirements([item])[0].value, "800000");
  assert.equal(normalizeEvolusRequirements(JSON.stringify({ requirements: [item] })).length, 1);
  assert.deepEqual(normalizeEvolusRequirements("not json"), []);
  assert.deepEqual(normalizeEvolusRequirements(null), []);
});

test("comparison pairs same kind within one page and lists the rest", () => {
  const result = compareExtractions(
    [req("certification", 4), req("min_turnover", 10), req("bid_guarantee", 20)],
    [
      { kind: "certification", description: "", page: 5, quote: "" },
      { kind: "bid_guarantee", description: "", page: 30, quote: "" },
      { kind: "execution_deadline", description: "", page: 2, quote: "" },
    ],
  );
  assert.equal(result.ours, 3);
  assert.equal(result.evolus, 3);
  assert.deepEqual(result.matched, [{ kind: "certification", ourPage: 4, evolusPage: 5 }]);
  assert.deepEqual(result.onlyOurs, [
    { kind: "min_turnover", page: 10 },
    { kind: "bid_guarantee", page: 20 },
  ]);
  assert.deepEqual(result.onlyEvolus, [
    { kind: "bid_guarantee", page: 30 },
    { kind: "execution_deadline", page: 2 },
  ]);
});

test("workflow execute sends input and file and returns the executionId", async () => {
  const { calls, fetchImpl } = fakeFetch(
    Response.json({ jobId: "j", executionId: "exec-1" }, { status: 202 }),
  );
  const run = await startTenderWorkflow(pdf, "t.pdf", "Tender 1", { env, fetchImpl, log: () => {} });
  assert.equal(run.executionId, "exec-1");
  assert.equal(calls[0].url, "https://api.evolus.ai/api/v1/workflows/workflow-1/execute");
  const form = calls[0].init.body as FormData;
  assert.equal(form.get("input"), "Tender 1");
  assert.ok(form.get("file") instanceof Blob);
});

test("workflow execution status is read from the executions endpoint", async () => {
  const { calls, fetchImpl } = fakeFetch(Response.json({ status: "Completed", output: { summary: "ok" } }));
  const run = await getTenderWorkflowExecution("exec-1", { env, fetchImpl, log: () => {} });
  assert.equal(calls[0].url, "https://api.evolus.ai/api/v1/workflows/workflow-1/executions/exec-1");
  assert.deepEqual(run, { executionId: "exec-1", status: "Completed", output: { summary: "ok" } });
});

test("missing configuration and Evolus errors map to HTTP statuses", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      startTenderWorkflow(pdf, "t.pdf", "x", { env: { ...env, EVOLUS_WORKFLOW_ID: "" } as NodeJS.ProcessEnv }),
      /EVOLUS_WORKFLOW_ID/,
    );
    assert.equal(evolusErrorResponse(new EvolusApiError("Evolus is not configured. Missing X.")).status, 503);
    assert.equal(evolusErrorResponse(new EvolusApiError("no credits", { status: 402 })).status, 402);
    assert.equal(evolusErrorResponse(new EvolusApiError("paused", { status: 409 })).status, 409);
    assert.equal(evolusErrorResponse(new EvolusApiError("boom", { status: 500 })).status, 502);
    assert.throws(() => evolusErrorResponse(new Error("other")));
  } finally {
    console.error = original;
  }
});

test("evolusErrorResponse never leaks the raw provider message", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const cases: { error: EvolusApiError; status: number; body: string }[] = [
      {
        error: new EvolusApiError("secret provider body xyz", { status: 500 }),
        status: 502,
        body: "Evolus is temporarily unavailable. Try again later.",
      },
      {
        error: new EvolusApiError("secret provider body xyz", { status: 402 }),
        status: 402,
        body: "Evolus credits are exhausted.",
      },
      {
        error: new EvolusApiError("secret provider body xyz", { status: 409 }),
        status: 409,
        body: "The Evolus agent is paused or busy.",
      },
      {
        error: new EvolusApiError("secret provider body xyz", { status: 429 }),
        status: 429,
        body: "Evolus is rate limiting requests. Try again later.",
      },
      {
        error: new EvolusApiError("Evolus is not configured. Missing X secret xyz"),
        status: 503,
        body: "Evolus is not configured.",
      },
    ];
    for (const { error, status, body } of cases) {
      const res = evolusErrorResponse(error);
      assert.equal(res.status, status);
      const json = (await res.json()) as { error: string };
      assert.equal(json.error, body);
      assert.ok(!json.error.includes("xyz"));
    }
  } finally {
    console.error = original;
  }
});
