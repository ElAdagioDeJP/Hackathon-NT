// Offline benchmark: compares saved extraction fixtures
// (fixtures/tenders/<id>.requirements.json) against hand labels
// (fixtures/eval/labels.json). No network, no LLM calls.
// Usage: bun run bench
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  benchmarkTender,
  precisionRecall,
  summarizeMatches,
  timingInfo,
  type LabeledRequirement,
  type TenderBenchmark,
} from "../app/services/ai/benchmark";
import { EXTRACT_PROMPT_VERSION } from "../app/services/ai/prompts/extract.v2";
import type { TenderFixture } from "../app/services/ai/analyze";
import type { ExtractionStats } from "../app/services/ai/extract";
import type { CompanyFacts, Requirement, TenderContext, Verdict } from "../app/services/ai/types";

const ROOT = process.cwd();

interface LabelsFile {
  labeledBy: string;
  labeledAt: string;
  company: string;
  tenders: Record<string, { expectedVerdict: Verdict; requirements: LabeledRequirement[] }>;
}

interface RequirementsFile {
  tenderId: string;
  prompt: string;
  stats: ExtractionStats;
  requirements: Requirement[];
}

const fmt = (n: number | null, digits = 2) =>
  n === null ? "n/a" : n.toFixed(digits);

async function main() {
  const labels = JSON.parse(await readFile(join(ROOT, "fixtures", "eval", "labels.json"), "utf8")) as LabelsFile;
  const companyPath = resolve(ROOT, labels.company);
  if (relative(ROOT, companyPath).startsWith(".."))
    throw new Error(`labels.company escapes the project root: ${labels.company}`);
  const company = JSON.parse(
    await readFile(companyPath, "utf8"),
  ) as CompanyFacts;
  const referenceDate = labels.labeledAt;
  const tenderIds = Object.keys(labels.tenders).sort();
  for (const tenderId of tenderIds) {
    if (!/^[\w.-]+$/.test(tenderId)) throw new Error(`Invalid tender id in labels.json: ${JSON.stringify(tenderId)}`);
  }

  const benchmarks: TenderBenchmark[] = [];
  const timings: ReturnType<typeof timingInfo>[] = [];
  const promptVersions = new Set<string>();
  for (const tenderId of tenderIds) {
    const saved = JSON.parse(
      await readFile(join(ROOT, "fixtures", "tenders", `${tenderId}.requirements.json`), "utf8"),
    ) as RequirementsFile;
    promptVersions.add(saved.prompt);
    const fixture = JSON.parse(
      await readFile(join(ROOT, "fixtures", "tenders", `${tenderId}.json`), "utf8"),
    ) as TenderFixture;
    // Same context analyzeTender builds: fixture metadata + reference "today".
    const tender: TenderContext = {
      tenderId: fixture.tenderId,
      lotId: fixture.lotId,
      estimatedValueEur: fixture.estimatedValueEur,
      now: new Date(referenceDate),
    };
    benchmarks.push(
      benchmarkTender({
        tenderId,
        extracted: saved.requirements,
        labeled: labels.tenders[tenderId].requirements,
        expectedVerdict: labels.tenders[tenderId].expectedVerdict,
        company,
        tender,
      }),
    );
    timings.push(timingInfo(tenderId, saved.stats));
  }

  // Aggregates.
  const allMatches = benchmarks.flatMap((b) => b.match.matches);
  const allMissed = benchmarks.flatMap((b) => b.match.missed);
  const allExtra = benchmarks.flatMap((b) => b.match.extra);
  const overall = precisionRecall(allMatches.length, allMatches.length + allExtra.length, allMatches.length + allMissed.length);

  const kinds = [...new Set([...allMatches.map((m) => m.label.kind), ...allMissed.map((m) => m.kind), ...allExtra.map((e) => e.kind)])].sort();
  const perKind = kinds.map((kind) => ({
    kind,
    ...precisionRecall(
      allMatches.filter((m) => m.label.kind === kind).length,
      allExtra.filter((e) => e.kind === kind).length + allMatches.filter((m) => m.label.kind === kind).length,
      allMissed.filter((m) => m.kind === kind).length + allMatches.filter((m) => m.label.kind === kind).length,
    ),
  }));

  const allDecisions = benchmarks.flatMap((b) => b.decisions);
  const correctDecisions = allDecisions.filter((d) => d.correct).length;
  const verdictsCorrect = benchmarks.filter((b) => b.verdictCorrect).length;
  const valueMismatches = allMatches.filter((m) => m.valueMismatch);

  const totalLabeled = allMatches.length + allMissed.length;
  const generated = new Date().toISOString().slice(0, 10);
  const models = [...new Set(timings.map((t) => t.model))];

  const lines: string[] = [
    "# Extraction benchmark",
    "",
    `Generated: ${generated}. Command: \`bun run bench\`.`,
    `Labels: ${labels.labeledBy} (${referenceDate}), ${totalLabeled} requirements across ${tenderIds.length} tenders.`,
    `Company: \`${labels.company}\`. Reference "today" for deadline rules: ${referenceDate}.`,
    `Extract prompt version in code: \`${EXTRACT_PROMPT_VERSION}\`; in fixtures: ${[...promptVersions].map((p) => `\`${p}\``).join(", ")}.`,
    `Model(s): ${models.map((m) => `\`${m}\``).join(", ")}.`,
    "",
    "Method: a labeled requirement matches an extracted one when the kind is equal",
    "and |page difference| <= 1; each extracted item matches at most one label",
    "(greedy by smallest page distance). Precision = matched / extracted,",
    "recall = matched / labeled. Verdicts and requirement decisions come from",
    "`evaluateAll` + `score`/`verdict` in `app/services/ai`, exactly as",
    "`analyzeTender` wires them. Timing is the saved extraction stats (no new run).",
    "",
    "Sample is small (14 labels, 3 tenders): treat every percentage as indicative, not significant.",
    "",
    "## Overall precision / recall",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Precision | ${fmt(overall.precision)} (${overall.matched}/${overall.extracted}) |`,
    `| Recall | ${fmt(overall.recall)} (${overall.matched}/${overall.labeled}) |`,
    "",
    "## Per kind",
    "",
    "| Kind | Precision | Recall | Matched / extracted / labeled |",
    "| --- | --- | --- | --- |",
    ...perKind.map(
      (k) => `| ${k.kind} | ${fmt(k.precision)} | ${fmt(k.recall)} | ${k.matched} / ${k.extracted} / ${k.labeled} |`,
    ),
    "",
    "## Per tender",
    "",
    "| Tender | Precision | Recall | Verdict expected | Verdict computed | Score | Verdict match |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...benchmarks.map((b) => {
      const pr = summarizeMatches(b.match);
      return `| ${b.tenderId} | ${fmt(pr.precision)} (${pr.matched}/${pr.extracted}) | ${fmt(pr.recall)} (${pr.matched}/${pr.labeled}) | ${b.expectedVerdict} | ${b.verdict} | ${b.score} | ${b.verdictCorrect ? "yes" : "no"} |`;
    }),
    "",
    `Verdict accuracy: ${verdictsCorrect}/${benchmarks.length}.`,
    "",
    "## Requirement-level decision accuracy",
    "",
    `Rules status of the extracted requirement vs the labeled expectation, over matched pairs: ${correctDecisions}/${allDecisions.length} (${fmt(allDecisions.length === 0 ? null : correctDecisions / allDecisions.length)}).`,
    "",
    "| Tender | Label | Extracted | Expected | Computed | Correct |",
    "| --- | --- | --- | --- | --- | --- |",
    ...benchmarks.flatMap((b) =>
      b.decisions.map(
        (d) =>
          `| ${b.tenderId} | ${d.pair.label.id} (${d.pair.label.kind}, p${d.pair.label.page}) | ${d.pair.extracted.id} (p${d.pair.extracted.page}) | ${d.pair.label.expected} | ${d.status} | ${d.correct ? "yes" : "no"} |`,
      ),
    ),
    "",
    "## Missed labels (no extracted match)",
    "",
    ...(allMissed.length === 0
      ? ["None."]
      : allMissed.map(
          (m) => `- ${m.id} (${m.kind}, p${m.page}): ${m.description}`,
        )),
    "",
    "## Extra extracted (no label)",
    "",
    ...(allExtra.length === 0
      ? ["None."]
      : benchmarks.flatMap((b) =>
          b.match.extra.map(
            (e) => `- ${b.tenderId} ${e.id} (${e.kind}, p${e.page}): ${e.description}`,
          ),
        )),
    "",
    "## Value mismatches (matched, numeric value differs)",
    "",
    ...(valueMismatches.length === 0
      ? ["None."]
      : valueMismatches.map(
          (m) => `- ${m.label.id} ↔ ${m.extracted.id}: label ${JSON.stringify(m.label.value)} vs extracted ${JSON.stringify(m.extracted.value)}`,
        )),
    "",
    "## Timing (saved extraction stats)",
    "",
    "| Tender | Model | ms | Prompt tokens | Completion tokens | Completion tok/s | Total tok/s |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...timings.map(
      (t) =>
        `| ${t.tenderId} | ${t.model} | ${t.ms} | ${t.promptTokens} | ${t.completionTokens} | ${t.completionTokPerSec.toFixed(1)} | ${t.totalTokPerSec.toFixed(1)} |`,
    ),
    "",
  ];

  await writeFile(join(ROOT, "docs", "benchmark.md"), lines.join("\n"));
  console.log(`tenders=${benchmarks.length} labeled=${totalLabeled} matched=${allMatches.length}`);
  console.log(`overall P=${fmt(overall.precision)} R=${fmt(overall.recall)}`);
  console.log(`decisions ${correctDecisions}/${allDecisions.length} correct; verdicts ${verdictsCorrect}/${benchmarks.length} correct`);
  console.log(`missed=${allMissed.length} extra=${allExtra.length} valueMismatch=${valueMismatches.length}`);
  console.log("wrote docs/benchmark.md");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
