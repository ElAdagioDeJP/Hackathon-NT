// Deterministic score and verdict. No LLM input.
//
// score = 100 × Σ(weight × credit) / Σ(weight), over the requirements found.
// credit: MEETS = 1, MISSING_DOC = 0.5, FAILS = 0. Rounded to an integer.
// verdict: any FAILS → NO_GO; else any MISSING_DOC → REVIEW; else GO.
// No requirements → score 0, REVIEW (nothing verified).
import type {
  ComplianceResult,
  ComplianceStatus,
  Requirement,
  RequirementKind,
  Verdict,
} from "./types";

export const WEIGHTS: Record<RequirementKind, number> = {
  certification: 25,
  min_turnover: 20,
  similar_projects: 20,
  submission_deadline: 15,
  bid_guarantee: 10,
  execution_deadline: 10,
};

export const CREDIT: Record<ComplianceStatus, number> = {
  MEETS: 1,
  MISSING_DOC: 0.5,
  FAILS: 0,
};

export function score(requirements: Requirement[], results: ComplianceResult[]) {
  const kinds = new Map(requirements.map((r) => [r.id, r.kind]));
  let total = 0;
  let earned = 0;
  for (const r of results) {
    const kind = kinds.get(r.requirementId);
    if (!kind) continue;
    total += WEIGHTS[kind];
    earned += WEIGHTS[kind] * CREDIT[r.status];
  }
  return total === 0 ? 0 : Math.round((100 * earned) / total);
}

export function verdict(results: ComplianceResult[]): Verdict {
  if (results.length === 0) return "REVIEW";
  if (results.some((r) => r.status === "FAILS")) return "NO_GO";
  if (results.some((r) => r.status === "MISSING_DOC")) return "REVIEW";
  return "GO";
}
