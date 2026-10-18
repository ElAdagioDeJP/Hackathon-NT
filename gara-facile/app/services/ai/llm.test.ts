import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { createLlmClient, endpointFor, type AiRun } from "./llm";

const endpoint = () => ({ baseUrl: "http://gpu:8001/v1", model: "qwen", apiKey: "k" });
const reply = (content: string, status = 200) =>
  new Response(
    JSON.stringify({
      model: "qwen",
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status },
  );

function harness(responses: (() => Response | Promise<Response>)[]) {
  const calls: { url: string; body: Record<string, unknown>; auth?: string }[] = [];
  const runs: AiRun[] = [];
  const waits: number[] = [];
  const client = createLlmClient({
    endpoint,
    sleep: async (ms) => void waits.push(ms),
    record: (run) => void runs.push(run),
    fetch: (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string> | undefined;
      calls.push({
        url,
        body: init.body ? JSON.parse(String(init.body)) : {},
        auth: headers?.authorization,
      });
      return responses[calls.length - 1]();
    }) as typeof fetch,
  });
  return { client, calls, runs, waits };
}

test("validates JSON against the schema and records the run", async () => {
  const h = harness([() => reply('```json\n{"items":[1,2]}\n```')]);
  const out = await h.client.chat({
    role: "extract",
    messages: [{ role: "user", content: "hi" }],
    schema: z.object({ items: z.array(z.number()) }),
  });
  assert.deepEqual(out.data, { items: [1, 2] });
  assert.equal(h.calls[0].url, "http://gpu:8001/v1/chat/completions");
  assert.equal(h.calls[0].auth, "Bearer k");
  assert.equal((h.calls[0].body.response_format as { type: string }).type, "json_schema");
  assert.equal(h.runs.length, 1);
  assert.equal(h.runs[0].ok, true);
  assert.equal(h.runs[0].promptTokens, 10);
  assert.equal(h.runs[0].completionTokens, 5);
});

test("retries once on 5xx, then fails and records the error", async () => {
  const ok = harness([() => reply("busy", 503), () => reply("hello")]);
  assert.equal((await ok.client.chat({ role: "draft", messages: [] })).data, "hello");
  assert.equal(ok.calls.length, 2);

  const bad = harness([() => reply("busy", 503), () => reply("busy", 503)]);
  await assert.rejects(bad.client.chat({ role: "draft", messages: [] }), /HTTP 503/);
  assert.equal(bad.calls.length, 2);
  assert.equal(bad.runs[0].ok, false);
});

test("honors Retry-After on 429 and sends reasoning effort", async () => {
  const h = harness([
    () => new Response("slow down", { status: 429, headers: { "retry-after": "7" } }),
    () => reply("ok"),
  ]);
  assert.equal((await h.client.chat({ role: "draft", messages: [] })).data, "ok");
  assert.deepEqual(h.waits, [7000]);

  const r = createLlmClient({
    endpoint: () => ({ ...endpoint(), reasoningEffort: "low" }),
    fetch: (async (_url: string, init: RequestInit) => {
      assert.equal(JSON.parse(String(init.body)).reasoning_effort, "low");
      return reply("x");
    }) as typeof fetch,
  });
  await r.chat({ role: "extract", messages: [] });
});

test("does not retry client errors", async () => {
  const h = harness([() => reply("nope", 401)]);
  await assert.rejects(h.client.chat({ role: "draft", messages: [] }), /HTTP 401/);
  assert.equal(h.calls.length, 1);
});

test("rejects JSON that does not match the schema", async () => {
  const h = harness([() => reply('{"items":"x"}')]);
  await assert.rejects(
    h.client.chat({ role: "extract", messages: [], schema: z.object({ items: z.array(z.number()) }) }),
    /not matching schema/,
  );
  assert.equal(h.runs[0].ok, false);
});

test("health reports whether the configured model is served", async () => {
  const h = harness([() => new Response(JSON.stringify({ data: [{ id: "qwen" }] }))]);
  const out = await h.client.health("extract");
  assert.equal(out.ok, true);
  assert.equal(h.calls[0].url, "http://gpu:8001/v1/models");
});

test("endpoint config comes from role-specific env vars", () => {
  const env = { LLM_DRAFT_BASE_URL: "http://x:8000/v1/", LLM_DRAFT_MODEL: "gemma", LLM_DRAFT_API_KEY: "s" };
  assert.deepEqual(endpointFor("draft", env), { baseUrl: "http://x:8000/v1", model: "gemma", apiKey: "s" });
  assert.throws(() => endpointFor("extract", env), /LLM_EXTRACT_BASE_URL/);
});

test("a reply that is not JSON is an LlmError, not a crash", async () => {
  const h = harness([() => reply("Sorry, I cannot help with that.")]);
  await assert.rejects(
    () =>
      h.client.chat({
        role: "extract",
        messages: [{ role: "user", content: "hi" }],
        schema: z.object({ items: z.array(z.number()) }),
      }),
    (error: Error) => error.name === "LlmError" && /not valid JSON/.test(error.message),
  );
  assert.equal(h.runs[0].ok, false);
});
