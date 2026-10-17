// Shared AI contract between extraction, rules, drafting and the UI.
// Frozen after review: announce any change to the AI pair and the UI team.

export type RequirementKind =
  | "certification"
  | "min_turnover"
  | "bid_guarantee"
  | "similar_projects"
  | "execution_deadline"
  | "submission_deadline";

export const REQUIREMENT_KINDS: readonly RequirementKind[] = [
  "certification",
  "min_turnover",
  "bid_guarantee",
  "similar_projects",
  "execution_deadline",
  "submission_deadline",
];

export interface Requirement {
  id: string;
  kind: RequirementKind;
  description: string; // normalized text, original language
  value?: number | string; // threshold: 500000, "ISO 27001", 0.02, "90 days"
  unit?: string; // "EUR" | "%" | "days" | "count"
  page: number; // required, 1-based tender page
  quote: string; // literal excerpt supporting the requirement
  confidence: number; // 0..1, informative only
}

export type ComplianceStatus = "MEETS" | "FAILS" | "MISSING_DOC";

export interface ComplianceResult {
  requirementId: string;
  status: ComplianceStatus;
  page: number;
  reason: string;
  evidence?: string; // profile field or document used
}

export type Verdict = "GO" | "NO_GO" | "REVIEW";

export interface TenderAnalysis {
  tenderId: string; // OJS publication number
  lotId?: string;
  results: ComplianceResult[];
  score: number; // 0..100, deterministic
  verdict: Verdict;
  generatedBy: { model: string; ms: number; tokens?: number };
}

export interface CompanyFacts {
  businessRecordId: number;
  name: string;
  country: string;
  city: string;
  offerings: string;
  cpvCodes: string[];
  certifications: { name: string; expiresAt?: string; hasDocument: boolean }[];
  languages: string[];
  annualTurnover: { year: number; amountEur: number }[]; // last 3 years
  employees?: number;
  isSme?: boolean;
  bidGuaranteeCapacityEur?: number;
  maxExecutionDays?: number;
  referenceProjects: {
    name: string;
    client: string;
    year: number;
    valueEur: number;
    isPublic: boolean;
  }[];
}

// Tender context the rules need beyond the requirement itself.
export interface TenderContext {
  tenderId: string;
  lotId?: string;
  estimatedValueEur?: number;
  now?: Date;
}

export interface TenderPage {
  page: number; // 1-based
  text: string;
  needsOcr: boolean;
}

export type LlmRole = "extract" | "draft";
