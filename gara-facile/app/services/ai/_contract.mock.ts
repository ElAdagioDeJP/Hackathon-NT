// Provisional copy of the shared AI contract (division-ai/GENERAL.md §3,
// AI_DEVELOPERS.md §2) until JP publishes app/services/ai/types.ts.
// When types.ts lands: point imports at "./types" and delete this file.

export type RequirementKind =
  | "certification"
  | "min_turnover"
  | "bid_guarantee"
  | "similar_projects"
  | "execution_deadline"
  | "submission_deadline";

export interface Requirement {
  id: string;
  kind: RequirementKind;
  description: string;
  value?: number | string;
  unit?: string;
  page: number;
  quote: string;
  confidence: number;
}

export type ComplianceStatus = "MEETS" | "FAILS" | "MISSING_DOC";

export interface ComplianceResult {
  requirementId: string;
  status: ComplianceStatus;
  page: number;
  reason: string;
  evidence?: string;
}

export interface TenderAnalysis {
  tenderId: string;
  lotId?: string;
  results: ComplianceResult[];
  score: number;
  verdict: "GO" | "NO_GO" | "REVIEW";
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
  annualTurnover: { year: number; amountEur: number }[];
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
