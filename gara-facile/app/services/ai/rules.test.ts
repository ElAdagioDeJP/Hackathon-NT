import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAmount, parseDays, parsePercent } from "./normalize";
import { evaluate, evaluateAll } from "./rules";
import { score, verdict } from "./scoring";
import type { CompanyFacts, Requirement, TenderContext } from "./types";

const now = new Date("2026-10-17T12:00:00Z");
const tender: TenderContext = { tenderId: "123456-2026", estimatedValueEur: 400_000, now };
const company: CompanyFacts = {
  businessRecordId: 1,
  name: "Demo Software S.r.l.",
  country: "ITA",
  city: "Milano",
  offerings: "Cloud software development",
  cpvCodes: ["72000000"],
  certifications: [
    { name: "ISO/IEC 27001:2022", expiresAt: "2027-05-01", hasDocument: true },
    { name: "ISO 9001", expiresAt: "2026-01-01", hasDocument: true },
    { name: "Qualificazione cloud AgID", hasDocument: false },
  ],
  languages: ["it", "en"],
  annualTurnover: [
    { year: 2023, amountEur: 600_000 },
    { year: 2024, amountEur: 700_000 },
    { year: 2025, amountEur: 860_000 },
  ],
  bidGuaranteeCapacityEur: 10_000,
  maxExecutionDays: 120,
  referenceProjects: [
    { name: "Portale ASL", client: "ASL Milano", year: 2024, valueEur: 250_000, isPublic: true },
    { name: "App Comune", client: "Comune di Pavia", year: 2025, valueEur: 120_000, isPublic: true },
  ],
};
let seq = 0;
const req = (r: Partial<Requirement> & Pick<Requirement, "kind">): Requirement => ({
  id: `r${++seq}`,
  description: "",
  page: 3,
  quote: "",
  confidence: 0.9,
  ...r,
});
const status = (r: Requirement, c = company, t = tender) => evaluate(r, c, t).status;

test("normalizes thresholds deterministically", () => {
  assert.equal(parseAmount("€1.500.000"), 1_500_000);
  assert.equal(parseAmount("1,500,000.00 EUR"), 1_500_000);
  assert.equal(parseAmount("1.500,50 €"), 1500.5);
  assert.equal(parseAmount("1,5 milioni di euro"), 1_500_000);
  assert.equal(parseAmount("750k"), 750_000);
  assert.equal(parsePercent("2%"), 0.02);
  assert.equal(parsePercent(0.02), 0.02);
  assert.equal(parsePercent(2), 0.02);
  assert.equal(parseDays("90 giorni"), 90);
  assert.equal(parseDays("6 mesi"), 180);
  assert.equal(parseDays("90 days"), 90);
});

test("certification: held, expired, missing, undocumented", () => {
  assert.equal(status(req({ kind: "certification", value: "ISO 27001" })), "MEETS");
  assert.equal(status(req({ kind: "certification", value: "ISO 9001" })), "FAILS");
  assert.equal(status(req({ kind: "certification", value: "ISO 14001" })), "FAILS");
  assert.equal(status(req({ kind: "certification", value: "qualificazione Cloud AgID" })), "MISSING_DOC");
  // 9001 must not match 19001 by substring.
  assert.equal(status(req({ kind: "certification", value: "ISO 19001" })), "FAILS");
});

test("min_turnover: average, total, each year and boundaries", () => {
  // average = 720k
  assert.equal(status(req({ kind: "min_turnover", value: 720_000, description: "fatturato medio annuo" })), "MEETS");
  assert.equal(status(req({ kind: "min_turnover", value: 720_001, description: "fatturato medio annuo" })), "FAILS");
  // total = 2.16M
  assert.equal(status(req({ kind: "min_turnover", value: 2_000_000, quote: "fatturato globale nel triennio" })), "MEETS");
  // lowest year = 600k
  assert.equal(status(req({ kind: "min_turnover", value: 650_000, description: "per ciascun anno" })), "FAILS");
  assert.equal(status(req({ kind: "min_turnover", value: 500_000 }), { ...company, annualTurnover: [] }), "MISSING_DOC");
  assert.equal(status(req({ kind: "min_turnover", value: "n/a" })), "MISSING_DOC");
});

test("bid_guarantee: percent of lot value, absolute, unknown lot value", () => {
  assert.equal(status(req({ kind: "bid_guarantee", value: 0.02, unit: "%" })), "MEETS"); // 8k ≤ 10k
  assert.equal(status(req({ kind: "bid_guarantee", value: "2%" }), company, { ...tender, estimatedValueEur: 600_000 }), "FAILS"); // 12k
  assert.equal(status(req({ kind: "bid_guarantee", value: 10_000, unit: "EUR" })), "MEETS");
  assert.equal(status(req({ kind: "bid_guarantee", value: 0.02 }), company, { ...tender, estimatedValueEur: undefined }), "MISSING_DOC");
  assert.equal(status(req({ kind: "bid_guarantee", value: 0.02 }), { ...company, bidGuaranteeCapacityEur: undefined }), "MISSING_DOC");
});

test("similar_projects: count, single value, aggregate value", () => {
  assert.equal(status(req({ kind: "similar_projects", value: 2, unit: "count" })), "MEETS");
  assert.equal(status(req({ kind: "similar_projects", value: 3, unit: "count" })), "FAILS");
  assert.equal(status(req({ kind: "similar_projects", value: 250_000, unit: "EUR" })), "MEETS");
  assert.equal(status(req({ kind: "similar_projects", value: 300_000, unit: "EUR" })), "FAILS");
  assert.equal(status(req({ kind: "similar_projects", value: 300_000, unit: "EUR", quote: "importo complessivo" })), "MEETS");
  assert.equal(status(req({ kind: "similar_projects", value: 1, unit: "count" }), { ...company, referenceProjects: [] }), "MISSING_DOC");
});

test("execution_deadline: company capacity vs required period", () => {
  assert.equal(status(req({ kind: "execution_deadline", value: "120 giorni" })), "MEETS");
  assert.equal(status(req({ kind: "execution_deadline", value: "90 days" })), "FAILS");
  assert.equal(status(req({ kind: "execution_deadline", value: "6 mesi" })), "MEETS");
  assert.equal(status(req({ kind: "execution_deadline", value: 90 }), { ...company, maxExecutionDays: undefined }), "MISSING_DOC");
});

test("submission_deadline: passed, inside margin, open, unreadable", () => {
  assert.equal(status(req({ kind: "submission_deadline", value: "2026-10-01T12:00:00Z" })), "FAILS");
  assert.equal(status(req({ kind: "submission_deadline", value: "2026-10-18T12:00:00Z" })), "FAILS");
  assert.equal(status(req({ kind: "submission_deadline", value: "2026-11-30T12:00:00Z" })), "MEETS");
  assert.equal(status(req({ kind: "submission_deadline", value: "soon" })), "MISSING_DOC");
});

test("score and verdict are deterministic", () => {
  const reqs = [
    req({ kind: "certification", value: "ISO 27001" }),
    req({ kind: "min_turnover", value: 500_000 }),
    req({ kind: "submission_deadline", value: "2026-11-30" }),
  ];
  const go = evaluateAll(reqs, company, tender);
  assert.equal(verdict(go), "GO");
  assert.equal(score(reqs, go), 100);

  const review = [...reqs, req({ kind: "certification", value: "Cloud AgID" })];
  const r2 = evaluateAll(review, company, tender);
  assert.equal(verdict(r2), "REVIEW");
  // (25 + 20 + 15 + 12.5) / 85 = 85.29 → 85
  assert.equal(score(review, r2), 85);

  const nogo = [...review, req({ kind: "certification", value: "ISO 14001" })];
  const r3 = evaluateAll(nogo, company, tender);
  assert.equal(verdict(r3), "NO_GO");
  assert.deepEqual(evaluateAll(nogo, company, tender), r3);

  assert.equal(verdict([]), "REVIEW");
  assert.equal(score([], []), 0);
});

test("results keep the requirement page for citation", () => {
  const r = req({ kind: "certification", value: "ISO 27001", page: 17 });
  assert.equal(evaluate(r, company, tender).page, 17);
});
