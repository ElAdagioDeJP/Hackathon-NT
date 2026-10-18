import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAFT_FOOTER, generateDraft } from "./draft";
import { LlmError } from "./llm";
import { demoCompanyFacts } from "./profileFacts";
import type { Requirement, TenderAnalysis } from "./types";

const requirements: Requirement[] = [
  {
    id: "min_turnover-1",
    kind: "min_turnover",
    description: "Fatturato globale minimo.",
    value: 800000,
    unit: "EUR",
    page: 15,
    quote: "fatturato globale",
    confidence: 1,
  },
  {
    id: "certification-1",
    kind: "certification",
    description: "ISO 9001.",
    value: "ISO 9001:2015",
    page: 4,
    quote: "certificazione ISO 9001",
    confidence: 0.9,
  },
];

const green: TenderAnalysis = {
  tenderId: "687674-2026",
  results: [
    { requirementId: "min_turnover-1", status: "MEETS", page: 15, reason: "Turnover above the threshold." },
    { requirementId: "certification-1", status: "MEETS", page: 4, reason: "Certificate on file.", evidence: "ISO 9001:2015" },
  ],
  score: 100,
  verdict: "GO",
  generatedBy: { model: "test", ms: 1 },
};

const fakeChat = (presentazione = "Siamo un'azienda seria.", esperienza = "Abbiamo esperienza.", piano = "Eseguiremo i lavori.") =>
  (async (options: { role: string }) => {
    assert.equal(options.role, "draft");
    return {
      content: "",
      data: { presentazione, esperienza, piano },
      model: "gemma",
      ms: 5,
      promptTokens: 10,
      completionTokens: 5,
    };
  }) as never;

test("happy path: four sections, footer on each, deterministic compliance lists every requirement", async () => {
  const draft = await generateDraft(
    { analysis: green, requirements, company: demoCompanyFacts() },
    { chat: fakeChat() },
  );
  assert.equal(draft.status, "draft");
  assert.equal(draft.language, "it");
  assert.deepEqual(
    draft.sections.map((s) => [s.key, s.title]),
    [
      ["presentazione", "Presentazione dell'azienda"],
      ["esperienza", "Esperienza pertinente"],
      ["piano", "Piano di esecuzione"],
      ["conformita", "Dichiarazione di conformità"],
    ],
  );
  for (const section of draft.sections)
    assert.ok(section.body.endsWith(DRAFT_FOOTER), `${section.key} misses the footer`);
  const compliance = draft.sections[3].body;
  for (const req of requirements)
    assert.ok(compliance.includes(req.id) && compliance.includes("MEETS"), `${req.id} missing from compliance`);
  assert.deepEqual(draft.warnings, []);
  assert.equal(draft.generatedBy.model, "gemma");
});

test("a FAILS result still generates, with the warning first", async () => {
  const red: TenderAnalysis = {
    ...green,
    verdict: "NO_GO",
    results: [
      { requirementId: "min_turnover-1", status: "FAILS", page: 15, reason: "Turnover below the threshold." },
      green.results[1],
    ],
  };
  const draft = await generateDraft(
    { analysis: red, requirements, company: demoCompanyFacts() },
    { chat: fakeChat() },
  );
  assert.equal(draft.sections.length, 4);
  assert.match(draft.warnings[0], /FAILS.*min_turnover-1/);
  assert.ok(draft.sections[3].body.includes("FAILS"));
});

test("an invented 3+ digit number warns", async () => {
  const draft = await generateDraft(
    { analysis: green, requirements, company: demoCompanyFacts() },
    { chat: fakeChat("Siamo un'azienda seria.", "Abbiamo esperienza.", "Fatturiamo 9.999.999 euro all'anno.") },
  );
  assert.equal(draft.warnings.length, 1);
  assert.match(draft.warnings[0], /9999999/);
});

test("numbers from the company facts do not warn", async () => {
  const draft = await generateDraft(
    { analysis: green, requirements, company: demoCompanyFacts() },
    { chat: fakeChat("Siamo 18 dipendenti.", "Progetto da 185000 euro nel 2024.", "Garanzia fino a 60000 euro.") },
  );
  assert.deepEqual(draft.warnings, []);
});

test("a tender threshold number echoed by the LLM does not warn", async () => {
  const draft = await generateDraft(
    { analysis: green, requirements, company: demoCompanyFacts() },
    { chat: fakeChat("Siamo un'azienda seria.", "Fatturiamo sopra gli 800000 euro richiesti.", "Eseguiremo i lavori.") },
  );
  assert.deepEqual(draft.warnings, []);
});

test("a MISSING_DOC result warns after the FAILS warning", async () => {
  const mixed: TenderAnalysis = {
    ...green,
    verdict: "NO_GO",
    results: [
      { requirementId: "min_turnover-1", status: "FAILS", page: 15, reason: "Turnover below the threshold." },
      { requirementId: "certification-1", status: "MISSING_DOC", page: 4, reason: "Certificate not uploaded." },
    ],
  };
  const draft = await generateDraft(
    { analysis: mixed, requirements, company: demoCompanyFacts() },
    { chat: fakeChat() },
  );
  assert.equal(draft.warnings.length, 2);
  assert.match(draft.warnings[0], /FAILS.*min_turnover-1/);
  assert.match(draft.warnings[1], /MISSING_DOC.*certification-1/);
});

test("a requirement without a matching result shows MISSING_DOC in compliance", async () => {
  const partial: TenderAnalysis = { ...green, results: [green.results[0]] };
  const draft = await generateDraft(
    { analysis: partial, requirements, company: demoCompanyFacts() },
    { chat: fakeChat() },
  );
  assert.ok(draft.sections[3].body.includes("certification-1"));
  assert.ok(draft.sections[3].body.includes("MISSING_DOC"));
});

test("chat throwing LlmError propagates", async () => {
  const broken = (async () => {
    throw new LlmError("LLM draft HTTP 503: overloaded", 503);
  }) as never;
  await assert.rejects(
    generateDraft({ analysis: green, requirements, company: demoCompanyFacts() }, { chat: broken }),
    LlmError,
  );
});
