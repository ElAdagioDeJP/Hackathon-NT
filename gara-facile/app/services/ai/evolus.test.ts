import assert from "node:assert/strict";
import { test } from "node:test";
import { EvolusApiError } from "../match/evolus";
import { evolusChat, evolusRequest } from "./evolus";

const env = {
  EVOLUS_API_KEY: "test-key",
  EVOLUS_APP_ID: "app-1",
  EVOLUS_AGENT_ID: "agent-1",
} as unknown as NodeJS.ProcessEnv;

function fakeFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test("evolusRequest sends REST auth headers and logs route without secrets", async () => {
  const { calls, fetchImpl } = fakeFetch(Response.json({ items: [] }));
  const lines: string[] = [];

  const body = await evolusRequest("/workflows", {}, { env, fetchImpl, log: (l) => lines.push(l) });

  assert.deepEqual(body, { items: [] });
  assert.equal(calls[0].url, "https://api.evolus.ai/api/v1/workflows");
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("X-ApiKey"), "test-key");
  assert.equal(headers.get("X-Application-Id"), "app-1");
  assert.ok(calls[0].init.signal, "timeout signal is set");
  const logged = JSON.parse(lines[0]).evolus;
  assert.equal(logged.path, "/workflows");
  assert.equal(logged.status, 200);
  assert.equal(typeof logged.ms, "number");
  assert.ok(!lines[0].includes("test-key"));
});

test("evolusRequest throws EvolusApiError with status and body", async () => {
  const { fetchImpl } = fakeFetch(Response.json({ error: "bad key" }, { status: 401 }));

  await assert.rejects(
    evolusRequest("/workflows", {}, { env, fetchImpl, log: () => {} }),
    (error: unknown) =>
      error instanceof EvolusApiError &&
      error.status === 401 &&
      (error.body as { error: string }).error === "bad key",
  );
});

test("evolusRequest fails fast when keys are missing", async () => {
  const { calls, fetchImpl } = fakeFetch(Response.json({}));

  await assert.rejects(evolusRequest("/workflows", {}, { env: {} as NodeJS.ProcessEnv, fetchImpl }), EvolusApiError);
  assert.equal(calls.length, 0);
});

test("evolusChat uses Bearer, app:agent model and conversation id", async () => {
  const { calls, fetchImpl } = fakeFetch(
    Response.json(
      { choices: [{ message: { content: "hola" } }] },
      { headers: { "X-Conversation-Id": "conv-2" } },
    ),
  );

  const result = await evolusChat([{ role: "user", content: "hi" }], "conv-1", {
    env,
    fetchImpl,
    log: () => {},
  });

  assert.deepEqual(result, { content: "hola", conversationId: "conv-2" });
  assert.equal(calls[0].url, "https://api.evolus.ai/v1/chat/completions");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer test-key");
  assert.equal(headers["X-Conversation-Id"], "conv-1");
  assert.equal(JSON.parse(calls[0].init.body as string).model, "app-1:agent-1");
});
