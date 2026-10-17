// End-to-end check of the deterministic half on the real demo tenders:
// hand labels must cite text that exists on the stated PDF page, and the
// rules must give the expected matrix for the demo company (2 red, 1 green).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import labels from "../../../fixtures/eval/labels.json";
import { loadFixture } from "./analyze";
import { locateQuote } from "./extract";
import { DEMO_COMPANY } from "./mocks/demoCompany";
import { parsePdf } from "./pdf";
import { evaluateAll } from "./rules";
import { score, verdict } from "./scoring";
import type { Requirement } from "./types";

const now = new Date("2026-10-17T12:00:00Z");

for (const [tenderId, tender] of Object.entries(labels.tenders)) {
  test(`${tenderId}: labels cite the PDF and the matrix is ${tender.expectedVerdict}`, async () => {
    const { fixture, bytes } = await loadFixture(tenderId);
    const pages = await parsePdf(bytes);
    const requirements = tender.requirements.map(
      ({ expected: _expected, ...r }) => ({ ...r, confidence: 1 }) as Requirement,
    );
    for (const r of requirements)
      assert.equal(locateQuote(r.quote, r.page, pages), r.page, `${r.id} quote not on page ${r.page}`);

    const results = evaluateAll(requirements, DEMO_COMPANY, {
      tenderId,
      estimatedValueEur: fixture.estimatedValueEur,
      now,
    });
    assert.deepEqual(
      Object.fromEntries(results.map((r) => [r.requirementId, r.status])),
      Object.fromEntries(tender.requirements.map((r) => [r.id, r.expected])),
    );
    assert.equal(verdict(results), tender.expectedVerdict);
    assert.ok(score(requirements, results) >= 0);
  });
}

test("fixture metadata matches the guarantee amounts stated in the PDFs", async () => {
  // 2% of the notice value must equal the euro amount the disciplinare states.
  const stated: Record<string, number> = { "691579-2026": 6720, "629600-2026": 420772.88, "687674-2026": 11102.21 };
  for (const [id, amount] of Object.entries(stated)) {
    const json = JSON.parse(await readFile(`fixtures/tenders/${id}.json`, "utf8"));
    assert.ok(Math.abs(json.estimatedValueEur * 0.02 - amount) < 0.5, id);
  }
});
