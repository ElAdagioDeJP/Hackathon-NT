import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyzeTender, loadSavedRequirements } from "./analyze";
import { demoCompanyFacts } from "./profileFacts";

test("loadSavedRequirements returns the 6 reviewed requirements with a model", async () => {
  const saved = await loadSavedRequirements("629600-2026");
  assert.ok(saved);
  assert.equal(saved.requirements.length, 6);
  assert.equal(typeof saved.stats.model, "string");
});

test("loadSavedRequirements returns null when the file is missing or invalid", async () => {
  const emptyDir = await mkdtemp(join(tmpdir(), "analyze-empty-"));
  assert.equal(await loadSavedRequirements("629600-2026", emptyDir), null);
  const brokenDir = await mkdtemp(join(tmpdir(), "analyze-broken-"));
  await writeFile(join(brokenDir, "629600-2026.requirements.json"), "{not json");
  assert.equal(await loadSavedRequirements("629600-2026", brokenDir), null);
  const noArrayDir = await mkdtemp(join(tmpdir(), "analyze-noarray-"));
  await writeFile(
    join(noArrayDir, "629600-2026.requirements.json"),
    JSON.stringify({ requirements: "oops" }),
  );
  assert.equal(await loadSavedRequirements("629600-2026", noArrayDir), null);
});

test("analyzeTender reuses the saved requirements without the LLM", async () => {
  const { analysis, requirements, stats } = await analyzeTender({
    tenderId: "629600-2026",
    company: demoCompanyFacts(),
    now: new Date("2026-10-17T12:00:00Z"),
  });
  assert.equal(requirements.length, 6);
  assert.equal(analysis.results.length, 6);
  assert.equal(analysis.verdict, "NO_GO");
  assert.equal(analysis.generatedBy.model, stats.model);
  assert.equal(analysis.generatedBy.tokens, stats.promptTokens + stats.completionTokens);
});

test("analyzeTender calls the injected extract instead of the saved requirements", async () => {
  let called = false;
  const stub = (async () => {
    called = true;
    return {
      requirements: [],
      stats: {
        windows: 0,
        failedWindows: 0,
        raw: 0,
        droppedNoQuote: 0,
        droppedBadValue: 0,
        duplicates: 0,
        ms: 1,
        promptTokens: 0,
        completionTokens: 0,
      },
    };
  }) as never;
  const { analysis, requirements } = await analyzeTender({
    tenderId: "629600-2026",
    company: demoCompanyFacts(),
    now: new Date("2026-10-17T12:00:00Z"),
    extract: stub,
  });
  assert.equal(called, true);
  assert.equal(requirements.length, 0);
  assert.equal(analysis.results.length, 0);
});
