// Offline benchmark for the tender requirement extractor. No network, no LLM:
// it only compares saved extraction fixtures against hand labels.
// Verdict/score logic is reused from scoring.ts and rules.ts, exactly as
// analyzeTender wires them (evaluateAll → score + verdict).
import { evaluateAll } from "./rules";
import { score, verdict } from "./scoring";
import type {
  CompanyFacts,
  ComplianceResult,
  ComplianceStatus,
  Requirement,
  RequirementKind,
  TenderContext,
  Verdict,
} from "./types";

// A hand-labeled requirement (shape of fixtures/eval/labels.json entries).
export interface LabeledRequirement {
  id: string;
  kind: RequirementKind;
  value?: number | string;
  unit?: string;
  page: number;
  description: string;
  quote: string;
  expected: ComplianceStatus;
}

export interface MatchedPair {
  label: LabeledRequirement;
  extracted: Requirement;
  pageDistance: number;
  valueMismatch: boolean;
}

export interface MatchResult {
  matches: MatchedPair[];
  missed: LabeledRequirement[];
  extra: Requirement[];
}

// Two numeric values count as different only when strictly unequal. String
// values (certification names, dates) are never flagged: the rules engine
// already normalizes names ("ISO 9001" vs "ISO 9001:2015" is the same cert)
// and flagging them would be noise.
function valuesDiffer(a: number | string | undefined, b: number | string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  if (typeof a === "number" && typeof b === "number") return a !== b;
  return false;
}

// A labeled requirement matches an extracted one when kind is equal and
// |page difference| <= 1. Each extracted item matches at most one label
// (and vice versa); candidates are assigned greedily by smallest page
// distance so the closest evidence wins ties.
export function matchRequirements(
  extracted: Requirement[],
  labeled: LabeledRequirement[],
): MatchResult {
  const candidates: { labelIdx: number; extIdx: number; distance: number }[] = [];
  labeled.forEach((label, labelIdx) => {
    extracted.forEach((req, extIdx) => {
      if (req.kind !== label.kind) return;
      const distance = Math.abs(req.page - label.page);
      if (distance <= 1) candidates.push({ labelIdx, extIdx, distance });
    });
  });
  candidates.sort((a, b) => a.distance - b.distance || a.labelIdx - b.labelIdx || a.extIdx - b.extIdx);

  const usedLabels = new Set<number>();
  const usedExtracted = new Set<number>();
  const matches: MatchedPair[] = [];
  for (const c of candidates) {
    if (usedLabels.has(c.labelIdx) || usedExtracted.has(c.extIdx)) continue;
    usedLabels.add(c.labelIdx);
    usedExtracted.add(c.extIdx);
    const label = labeled[c.labelIdx];
    const req = extracted[c.extIdx];
    matches.push({
      label,
      extracted: req,
      pageDistance: c.distance,
      valueMismatch: valuesDiffer(label.value, req.value),
    });
  }
  return {
    matches,
    missed: labeled.filter((_, i) => !usedLabels.has(i)),
    extra: extracted.filter((_, i) => !usedExtracted.has(i)),
  };
}

export interface PrecisionRecall {
  matched: number;
  extracted: number;
  labeled: number;
  // null when the denominator is zero (e.g. no extracted requirements).
  precision: number | null;
  recall: number | null;
}

export function precisionRecall(matched: number, extracted: number, labeled: number): PrecisionRecall {
  return {
    matched,
    extracted,
    labeled,
    precision: extracted === 0 ? null : matched / extracted,
    recall: labeled === 0 ? null : matched / labeled,
  };
}

export function summarizeMatches(match: MatchResult): PrecisionRecall {
  return precisionRecall(match.matches.length, match.matches.length + match.extra.length, match.matches.length + match.missed.length);
}

// Full per-tender benchmark: matching plus the rules-engine verdict, built
// exactly like analyzeTender (evaluateAll over all extracted requirements
// with the fixture tender context, then score + verdict from scoring.ts).
export interface TenderBenchmark {
  tenderId: string;
  match: MatchResult;
  results: ComplianceResult[];
  score: number;
  verdict: Verdict;
  expectedVerdict: Verdict;
  verdictCorrect: boolean;
  // Requirement-level decision accuracy over matched pairs: rules status of
  // the extracted requirement vs the labeled expectation.
  decisions: { pair: MatchedPair; status: ComplianceStatus; correct: boolean }[];
  decisionAccuracy: number | null;
}

export function benchmarkTender(input: {
  tenderId: string;
  extracted: Requirement[];
  labeled: LabeledRequirement[];
  expectedVerdict: Verdict;
  company: CompanyFacts;
  tender: TenderContext;
}): TenderBenchmark {
  const match = matchRequirements(input.extracted, input.labeled);
  const results = evaluateAll(input.extracted, input.company, input.tender);
  const statusById = new Map(results.map((r) => [r.requirementId, r.status]));
  const computedVerdict = verdict(results);
  const decisions = match.matches.map((pair) => {
    const status: ComplianceStatus = statusById.get(pair.extracted.id) ?? "MISSING_DOC";
    return { pair, status, correct: status === pair.label.expected };
  });
  const correct = decisions.filter((d) => d.correct).length;
  return {
    tenderId: input.tenderId,
    match,
    results,
    score: score(input.extracted, results),
    verdict: computedVerdict,
    expectedVerdict: input.expectedVerdict,
    verdictCorrect: computedVerdict === input.expectedVerdict,
    decisions,
    decisionAccuracy: decisions.length === 0 ? null : correct / decisions.length,
  };
}

// Timing derived from the saved extraction stats (no new measurement).
export interface TimingInfo {
  tenderId: string;
  model: string;
  ms: number;
  promptTokens: number;
  completionTokens: number;
  completionTokPerSec: number;
  totalTokPerSec: number;
}

export function timingInfo(
  tenderId: string,
  stats: { ms?: unknown; promptTokens?: unknown; completionTokens?: unknown; model?: string },
): TimingInfo {
  const ms = Number(stats.ms) || 0;
  const promptTokens = Number(stats.promptTokens) || 0;
  const completionTokens = Number(stats.completionTokens) || 0;
  const seconds = ms / 1000;
  const total = promptTokens + completionTokens;
  return {
    tenderId,
    model: stats.model ?? "unknown",
    ms,
    promptTokens,
    completionTokens,
    completionTokPerSec: seconds > 0 ? completionTokens / seconds : 0,
    totalTokPerSec: seconds > 0 ? total / seconds : 0,
  };
}
