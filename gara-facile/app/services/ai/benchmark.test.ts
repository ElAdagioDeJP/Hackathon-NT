import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { join } from "node:path";
import {
  benchmarkTender,
  matchRequirements,
  precisionRecall,
  summarizeMatches,
  timingInfo,
  type LabeledRequirement,
} from "./benchmark";
import type { CompanyFacts, Requirement, TenderContext, Verdict } from "./types";

let seq = 0;
const ext = (r: Partial<Requirement> & Pick<Requirement, "kind">): Requirement => ({
  id: `e${++seq}`,
  description: "",
  page: 5,
  quote: "",
  confidence: 0.9,
  ...r,
});
const lab = (l: Partial<LabeledRequirement> & Pick<LabeledRequirement, "kind">): LabeledRequirement => ({
  id: `l${++seq}`,
  page: 5,
  description: "",
  quote: "",
  expected: "MEETS",
  ...l,
});

test("same kind on the same page matches", () => {
  const m = matchRequirements(
    [ext({ id: "e1", kind: "certification", page: 5 })],
    [lab({ id: "l1", kind: "certification", page: 5 })],
  );
  assert.equal(m.matches.length, 1);
  assert.equal(m.matches[0].pageDistance, 0);
  assert.equal(m.matches[0].valueMismatch, false);
  assert.deepEqual(m.missed, []);
  assert.deepEqual(m.extra, []);
});

test("page difference of 1 matches, of 2 does not", () => {
  const label = lab({ kind: "certification", page: 5 });
  assert.equal(matchRequirements([ext({ kind: "certification", page: 6 })], [label]).matches.length, 1);
  assert.equal(matchRequirements([ext({ kind: "certification", page: 4 })], [label]).matches.length, 1);
  const miss = matchRequirements([ext({ kind: "certification", page: 7 })], [label]);
  assert.equal(miss.matches.length, 0);
  assert.equal(miss.missed.length, 1);
  assert.equal(miss.extra.length, 1);
});

test("different kinds never match", () => {
  const m = matchRequirements(
    [ext({ kind: "certification", page: 5 })],
    [lab({ kind: "min_turnover", page: 5 })],
  );
  assert.equal(m.matches.length, 0);
  assert.equal(m.missed.length, 1);
  assert.equal(m.extra.length, 1);
});

test("one extracted item cannot match two labels: closest page wins", () => {
  const m = matchRequirements(
    [ext({ id: "e1", kind: "certification", page: 5 })],
    [
      lab({ id: "near", kind: "certification", page: 5 }),
      lab({ id: "far", kind: "certification", page: 6 }),
    ],
  );
  assert.equal(m.matches.length, 1);
  assert.equal(m.matches[0].label.id, "near");
  assert.equal(m.matches[0].pageDistance, 0);
  assert.deepEqual(m.missed.map((l) => l.id), ["far"]);
  assert.deepEqual(m.extra, []);
});

test("one label cannot match two extracted items: closest page wins", () => {
  const m = matchRequirements(
    [
      ext({ id: "close", kind: "certification", page: 5 }),
      ext({ id: "off", kind: "certification", page: 6 }),
    ],
    [lab({ id: "l1", kind: "certification", page: 5 })],
  );
  assert.equal(m.matches.length, 1);
  assert.equal(m.matches[0].extracted.id, "close");
  assert.deepEqual(m.missed, []);
  assert.deepEqual(m.extra.map((e) => e.id), ["off"]);
});

test("numeric value differences flag valueMismatch; strings never do", () => {
  const numeric = (labelValue: number | undefined, extractedValue: number | undefined) =>
    matchRequirements(
      [ext({ kind: "min_turnover", page: 5, value: extractedValue })],
      [lab({ kind: "min_turnover", page: 5, value: labelValue })],
    ).matches[0].valueMismatch;
  assert.equal(numeric(100, 100), false);
  assert.equal(numeric(100, 200), true);
  assert.equal(numeric(undefined, 200), false);
  assert.equal(numeric(100, undefined), false);

  const textual = (labelValue: string, extractedValue: string) =>
    matchRequirements(
      [ext({ kind: "certification", page: 5, value: extractedValue })],
      [lab({ kind: "certification", page: 5, value: labelValue })],
    ).matches[0].valueMismatch;
  assert.equal(textual("ISO 9001", "ISO 9001:2015"), false);
  assert.equal(textual("ISO 9001", "ISO 14001"), false);
});

test("missed and extra list exactly the unmatched items", () => {
  const m = matchRequirements(
    [
      ext({ id: "hit", kind: "certification", page: 5 }),
      ext({ id: "spare", kind: "bid_guarantee", page: 1 }),
    ],
    [
      lab({ id: "found", kind: "certification", page: 5 }),
      lab({ id: "lost", kind: "min_turnover", page: 5 }),
    ],
  );
  assert.equal(m.matches.length, 1);
  assert.equal(m.matches[0].label.id, "found");
  assert.deepEqual(m.missed.map((l) => l.id), ["lost"]);
  assert.deepEqual(m.extra.map((e) => e.id), ["spare"]);
});

test("zero denominators give null precision/recall", () => {
  assert.equal(precisionRecall(0, 0, 5).precision, null);
  assert.equal(precisionRecall(0, 0, 5).recall, 0);
  assert.equal(precisionRecall(0, 3, 0).recall, null);
  assert.equal(precisionRecall(0, 3, 0).precision, 0);
  const both = precisionRecall(0, 0, 0);
  assert.equal(both.precision, null);
  assert.equal(both.recall, null);
  const pr = precisionRecall(2, 4, 8);
  assert.equal(pr.precision, 0.5);
  assert.equal(pr.recall, 0.25);
});

test("summarizeMatches derives precision/recall from a match result", () => {
  const m = matchRequirements(
    [ext({ kind: "certification", page: 5 })],
    [lab({ kind: "certification", page: 5 }), lab({ kind: "certification", page: 9 })],
  );
  const pr = summarizeMatches(m);
  assert.deepEqual(
    { matched: pr.matched, extracted: pr.extracted, labeled: pr.labeled },
    { matched: 1, extracted: 1, labeled: 2 },
  );
  assert.equal(pr.precision, 1);
  assert.equal(pr.recall, 0.5);
  const empty = summarizeMatches(matchRequirements([], []));
  assert.equal(empty.precision, null);
  assert.equal(empty.recall, null);
});

test("timing derives tokens/s from the saved stats", () => {
  const t = timingInfo("t1", { ms: 2000, promptTokens: 100, completionTokens: 60, model: "m" });
  // 60 completion tokens over 2 s; 160 total tokens over 2 s.
  assert.equal(t.completionTokPerSec, 30);
  assert.equal(t.totalTokPerSec, 80);
  assert.equal(t.model, "m");
  assert.equal(timingInfo("t2", { ms: 1000, promptTokens: 10, completionTokens: 5 }).model, "unknown");
  const zero = timingInfo("t3", { ms: 0, promptTokens: 10, completionTokens: 5 });
  assert.equal(zero.completionTokPerSec, 0);
  assert.equal(zero.totalTokPerSec, 0);
});

test("timingInfo with missing stats fields never yields NaN", () => {
  const t = timingInfo("t9", {});
  assert.equal(t.ms, 0);
  assert.equal(t.promptTokens, 0);
  assert.equal(t.completionTokens, 0);
  assert.equal(t.completionTokPerSec, 0);
  assert.equal(t.totalTokPerSec, 0);
  for (const n of [t.ms, t.promptTokens, t.completionTokens, t.completionTokPerSec, t.totalTokPerSec]) {
    assert.ok(!Number.isNaN(n), `expected a real number, got ${n}`);
  }
});

test("greedy ties break deterministically by label index, then extracted index", () => {
  // Every candidate has distance 0, so the pairing must follow index order.
  const extracted = () => [
    ext({ id: "e1", kind: "certification", page: 5 }),
    ext({ id: "e2", kind: "certification", page: 5 }),
  ];
  const labeled = () => [
    lab({ id: "l1", kind: "certification", page: 5 }),
    lab({ id: "l2", kind: "certification", page: 5 }),
  ];
  const first = matchRequirements(extracted(), labeled());
  assert.deepEqual(
    first.matches.map((p) => [p.label.id, p.extracted.id]),
    [["l1", "e1"], ["l2", "e2"]],
  );
  // Repeating the same input yields exactly the same pairing.
  const second = matchRequirements(extracted(), labeled());
  assert.deepEqual(
    second.matches.map((p) => [p.label.id, p.extracted.id]),
    first.matches.map((p) => [p.label.id, p.extracted.id]),
  );
});

test("real fixtures pin totals: matched 13, extracted 19, labeled 14", async () => {
  // Same loading as scripts/benchmark.ts, aggregated with summarizeMatches.
  const root = process.cwd();
  const labels = JSON.parse(await readFile(join(root, "fixtures", "eval", "labels.json"), "utf8")) as {
    tenders: Record<string, { requirements: LabeledRequirement[] }>;
  };
  let matched = 0;
  let extracted = 0;
  let labeled = 0;
  for (const tenderId of Object.keys(labels.tenders).sort()) {
    const saved = JSON.parse(
      await readFile(join(root, "fixtures", "tenders", `${tenderId}.requirements.json`), "utf8"),
    ) as { requirements: Requirement[] };
    const pr = summarizeMatches(matchRequirements(saved.requirements, labels.tenders[tenderId].requirements));
    matched += pr.matched;
    extracted += pr.extracted;
    labeled += pr.labeled;
  }
  assert.deepEqual({ matched, extracted, labeled }, { matched: 13, extracted: 19, labeled: 14 });
});

test("real fixtures: 14 labels, all verdicts match, no decision mismatch", async () => {
  // Same loading as scripts/benchmark.ts: hand labels + saved extractions +
  // fixture metadata for the tender context, with labeledAt as "today".
  const root = process.cwd();
  const labels = JSON.parse(await readFile(join(root, "fixtures", "eval", "labels.json"), "utf8")) as {
    company: string;
    labeledAt: string;
    tenders: Record<string, { expectedVerdict: Verdict; requirements: LabeledRequirement[] }>;
  };
  const company = JSON.parse(await readFile(join(root, labels.company), "utf8")) as CompanyFacts;
  const tenderIds = Object.keys(labels.tenders).sort();
  assert.equal(tenderIds.length, 3);
  assert.equal(
    tenderIds.reduce((n, id) => n + labels.tenders[id].requirements.length, 0),
    14,
  );
  for (const tenderId of tenderIds) {
    const saved = JSON.parse(
      await readFile(join(root, "fixtures", "tenders", `${tenderId}.requirements.json`), "utf8"),
    ) as { requirements: Requirement[] };
    const fixture = JSON.parse(
      await readFile(join(root, "fixtures", "tenders", `${tenderId}.json`), "utf8"),
    ) as { tenderId: string; lotId?: string; estimatedValueEur?: number };
    const tender: TenderContext = {
      tenderId: fixture.tenderId,
      lotId: fixture.lotId,
      estimatedValueEur: fixture.estimatedValueEur,
      now: new Date(labels.labeledAt),
    };
    const b = benchmarkTender({
      tenderId,
      extracted: saved.requirements,
      labeled: labels.tenders[tenderId].requirements,
      expectedVerdict: labels.tenders[tenderId].expectedVerdict,
      company,
      tender,
    });
    assert.equal(b.verdict, b.expectedVerdict, tenderId);
    for (const d of b.decisions) {
      assert.equal(d.status, d.pair.label.expected, `${tenderId} ${d.pair.label.id}`);
    }
  }
});
