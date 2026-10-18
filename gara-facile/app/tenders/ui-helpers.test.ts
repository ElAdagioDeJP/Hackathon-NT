import assert from "node:assert/strict";
import { test } from "node:test";
import type { BidDraft } from "@/app/services/ai/draft";
import { decodeEntities, draftToText, friendlyError, requestJson } from "./ui-helpers";

test("friendlyError handles 429 with and without retry-after", () => {
  assert.equal(
    friendlyError(429, {}, "30"),
    "Too many requests. Try again in 30 seconds.",
  );
  assert.equal(
    friendlyError(429, {}, null),
    "Too many requests. Try again in a minute.",
  );
  assert.equal(
    friendlyError(429, {}, "abc"),
    "Too many requests. Try again in a minute.",
  );
});

test("friendlyError maps 401 and 403 to session expiry", () => {
  assert.equal(
    friendlyError(401, {}, null),
    "Your profile session expired. Open your business profile again.",
  );
  assert.equal(
    friendlyError(403, {}, null),
    "Your profile session expired. Open your business profile again.",
  );
});

test("friendlyError handles 404", () => {
  assert.equal(
    friendlyError(404, { error: "Tender gone." }, null),
    "Tender gone.",
  );
  assert.equal(friendlyError(404, {}, null), "Not found.");
});

test("friendlyError handles 502 and 503", () => {
  assert.equal(
    friendlyError(502, {}, null),
    "The AI service is busy right now. Try again shortly.",
  );
  assert.equal(
    friendlyError(503, {}, null),
    "The AI service is busy right now. Try again shortly.",
  );
});

test("friendlyError falls back for 500", () => {
  assert.equal(
    friendlyError(500, { error: "Boom." }, null),
    "Boom.",
  );
  assert.equal(
    friendlyError(500, "boom", null),
    "Something went wrong. Try again.",
  );
  assert.equal(
    friendlyError(500, null, null),
    "Something went wrong. Try again.",
  );
});

test("requestJson returns parsed JSON on success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
  try {
    assert.deepEqual(await requestJson<{ ok: boolean }>("/api/x"), {
      ok: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestJson rejects with the friendly 429 message from the retry-after header", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({}), {
      status: 429,
      headers: { "retry-after": "7" },
    })) as typeof fetch;
  try {
    await assert.rejects(
      () => requestJson("/api/x"),
      (e: unknown) =>
        e instanceof Error &&
        e.message === "Too many requests. Try again in 7 seconds.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestJson still throws the friendly message for a non-JSON body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<html>", { status: 500 })) as typeof fetch;
  try {
    await assert.rejects(() => requestJson("/api/x"), /Something went wrong/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("draftToText renders title, sections and footer", () => {
  const draft: BidDraft = {
    status: "draft",
    language: "it",
    warnings: [],
    generatedBy: { model: "test", ms: 1 },
    sections: [
      { key: "presentazione", title: "Company", body: "We are great." },
      { key: "esperienza", title: "Experience", body: "We did things." },
    ],
  };
  assert.equal(
    draftToText("My tender", draft),
    "My tender\n\nCompany\n\nWe are great.\n\nExperience\n\nWe did things.\n\nGenerato con IA — da revisionare",
  );
});

test("draftToText does not duplicate the footer already at the end", () => {
  const draft: BidDraft = {
    status: "draft",
    language: "it",
    warnings: [],
    generatedBy: { model: "test", ms: 1 },
    sections: [
      { key: "presentazione", title: "Company", body: "We are great." },
      {
        key: "esperienza",
        title: "Experience",
        body: "We did things.\nGenerato con IA — da revisionare",
      },
    ],
  };
  const text = draftToText("My tender", draft);
  const occurrences = text.split("Generato con IA — da revisionare").length - 1;
  assert.equal(occurrences, 1);
  assert.ok(text.trimEnd().endsWith("Generato con IA — da revisionare"));
});

test("decodeEntities decodes numeric and named entities", () => {
  assert.equal(decodeEntities("Road &#8211; Bridge"), "Road – Bridge");
  assert.equal(
    decodeEntities("A &#x2014; B &amp; C &lt;D&gt; &quot;E&quot; &#39;F&#39; &apos;G&apos;"),
    "A — B & C <D> \"E\" 'F' 'G'",
  );
});
