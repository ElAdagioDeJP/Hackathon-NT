import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as chat } from "../../api/ai/chat/route";
import { POST as extract } from "../../api/ai/evolus/extract/route";
import { POST as workflow } from "../../api/ai/evolus/workflow/route";

// Evolus stays unconfigured, so every allowed call fails fast with 503 and
// never reaches the network, but still counts against the limit.
for (const key of Object.keys(process.env)) if (key.startsWith("EVOLUS_")) delete process.env[key];

const post = (body: unknown, ip: string) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

test("assistant chat is limited per client address", async () => {
  for (let i = 0; i < 20; i++)
    assert.equal((await chat(post({ message: "Ciao" }, "203.0.113.1"))).status, 503);
  const limited = await chat(post({ message: "Ciao" }, "203.0.113.1"));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal((await chat(post({ message: "Ciao" }, "203.0.113.2"))).status, 503);
  // Invalid input is rejected before it is counted.
  assert.equal((await chat(post({}, "203.0.113.3"))).status, 400);
});

test("extractor and workflow runs share a per-address budget", async () => {
  const tender = { tenderId: "691579-2026", refresh: true };
  assert.equal((await workflow(post(tender, "198.51.100.1"))).status, 503);
  assert.equal((await workflow(post(tender, "198.51.100.1"))).status, 503);
  assert.equal((await extract(post(tender, "198.51.100.1"))).status, 202);
  assert.equal((await workflow(post(tender, "198.51.100.1"))).status, 429);
  assert.equal((await extract(post({ ...tender, tenderId: "629600-2026" }, "198.51.100.1"))).status, 429);
  // Unknown tenders are rejected before they are counted.
  assert.equal((await workflow(post({ tenderId: "nope-2026" }, "198.51.100.2"))).status, 404);
  assert.equal((await workflow(post(tender, "198.51.100.2"))).status, 503);
});
