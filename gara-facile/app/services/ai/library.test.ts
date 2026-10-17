import assert from "node:assert/strict";
import { test } from "node:test";
import { EvolusApiError } from "../match/evolus";
import { companyFactsText, syncLibrary, type LibraryFile } from "./library";
import { demoCompanyFacts } from "./profileFacts";

const env = {
  EVOLUS_API_KEY: "test-key",
  EVOLUS_APP_ID: "app-1",
  EVOLUS_LIBRARY_ID: "lib-1",
} as unknown as NodeJS.ProcessEnv;

const sheet: LibraryFile = {
  name: "scheda-azienda-demo.txt",
  bytes: new TextEncoder().encode(companyFactsText(demoCompanyFacts())),
  mimeType: "text/plain",
};

// Fake Evolus library: GET lists stored titles, POST stores the uploaded file name.
function fakeLibrary(titles: string[] = []) {
  const posts: { url: string; body: FormData }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    if (init.method === "POST") {
      const body = init.body as FormData;
      posts.push({ url, body });
      const title = (body.get("file") as File).name;
      titles.push(title);
      return Response.json({ id: `doc-${titles.length}`, title }, { status: 201 });
    }
    return Response.json(titles.map((title) => ({ title })));
  }) as typeof fetch;
  return { posts, fetchImpl };
}

test("companyFactsText lists the facts the agent must cite", () => {
  const text = companyFactsText(demoCompanyFacts());
  assert.match(text, /Scheda aziendale: /);
  assert.match(text, /ISO 9001/);
  assert.match(text, /Fatturato annuo:/);
});

test("syncLibrary uploads multipart with explicit language, then skips unchanged files", async () => {
  const { posts, fetchImpl } = fakeLibrary();
  const deps = { env, fetchImpl, log: () => {} };

  const first = await syncLibrary([sheet], "it", deps);
  assert.equal(first.uploaded.length, 1);
  assert.match(first.uploaded[0].title, /^scheda-azienda-demo-[0-9a-f]{12}\.txt$/);
  assert.equal(first.uploaded[0].documentId, "doc-1");
  assert.equal(posts[0].url, "https://api.evolus.ai/api/v1/memories/lib-1/documents?language=it");
  assert.ok(posts[0].body.get("file") instanceof Blob);

  const second = await syncLibrary([sheet], "it", deps);
  assert.deepEqual(second.uploaded, []);
  assert.equal(second.skipped[0].reason, "unchanged");
  assert.equal(posts.length, 1);
});

test("syncLibrary skips unsupported formats without calling Evolus", async () => {
  const { posts, fetchImpl } = fakeLibrary();
  const xlsx = { name: "bilancio.xlsx", bytes: new Uint8Array([1]), mimeType: "application/octet-stream" };

  const result = await syncLibrary([xlsx], "it", { env, fetchImpl, log: () => {} });
  assert.deepEqual(result.skipped, [{ title: "bilancio.xlsx", reason: "unsupported" }]);
  assert.equal(posts.length, 0);
});

test("syncLibrary fails fast without EVOLUS_LIBRARY_ID", async () => {
  const { fetchImpl } = fakeLibrary();
  await assert.rejects(
    syncLibrary([sheet], "it", { env: { ...env, EVOLUS_LIBRARY_ID: "" }, fetchImpl }),
    EvolusApiError,
  );
});
