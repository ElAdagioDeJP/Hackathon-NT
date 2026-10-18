// Deterministic eligibility rules. The LLM extracts requirements; only this
// code decides whether the company meets them.
import { canonical, parseAmount, parseDays, parsePercent } from "./normalize";
import type {
  CompanyFacts,
  ComplianceResult,
  ComplianceStatus,
  Requirement,
  RequirementKind,
  TenderContext,
} from "./types";

export const SUBMISSION_MARGIN_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const eur = (n: number) => `€${Math.round(n).toLocaleString("en-US")}`;

type Rule = (
  requirement: Requirement,
  company: CompanyFacts,
  tender: TenderContext,
) => Omit<ComplianceResult, "requirementId" | "page">;

const result = (status: ComplianceStatus, reason: string, evidence?: string) => ({
  status,
  reason,
  evidence,
});

// "ISO/IEC 27001:2022" and "iso 27001" compare equal. "Serie ISO 9000" asks
// for a quality system of the 9000 family, which ISO 9001 certifies.
const certKey = (name: string) =>
  canonical(name)
    .replace(/\b(iso|iec|uni|cei|en)\b/g, " ")
    .replace(/:\d{4}\b/g, "")
    .replace(/\b9000\b/g, "9001")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Standard numbers ("9001", "14001", "27001"). Four-digit years are editions.
const standards = (key: string) => [
  ...new Set(key.split(" ").filter((t) => /^\d{3,}$/.test(t) && !/^(19|20)\d\d$/.test(t))),
];
const ALTERNATIVES = /\b(or|o|oppure|ou|oder|u)\b/;
const SEVERITY: Record<ComplianceStatus, number> = { MEETS: 0, MISSING_DOC: 1, FAILS: 2 };

const certification: Rule = (req, company, tender) => {
  const wanted = String(req.value ?? req.description);
  if (company.certifications.length === 0)
    return result("MISSING_DOC", `${wanted} required, no certifications declared`, "certifications");
  const key = certKey(wanted);
  const now = tender.now ?? new Date();
  const judge = (held: CompanyFacts["certifications"][number] | undefined, missing: string) => {
    if (!held) return result("FAILS", `Missing ${missing}`, "certifications");
    if (held.expiresAt && new Date(held.expiresAt).getTime() < now.getTime())
      return result("FAILS", `${held.name} expired on ${held.expiresAt}`, "certifications");
    if (!held.hasDocument)
      return result("MISSING_DOC", `${held.name} declared but certificate not uploaded`, "certifications");
    return result("MEETS", `${held.name} held with document`, "certifications");
  };
  const codes = standards(key);
  if (codes.length === 0) {
    const within = (a: string, b: string) => ` ${b} `.includes(` ${a} `);
    const held = company.certifications.find((c) => {
      const k = certKey(c.name);
      return k.length > 0 && key.length > 0 && (within(key, k) || within(k, key));
    });
    return judge(held, wanted);
  }
  // "ISO 9001 and 14001" needs both standards; "ISO 9001 or 14001" needs one.
  const checks = codes.map((code) =>
    judge(
      company.certifications.find((c) => standards(certKey(c.name)).includes(code)),
      codes.length === 1 ? wanted : `${code} (${wanted} required)`,
    ),
  );
  const pick = ALTERNATIVES.test(key) ? Math.min : Math.max;
  const target = pick(...checks.map((c) => SEVERITY[c.status]));
  return checks.find((c) => SEVERITY[c.status] === target)!;
};

const turnoverBasis = (text: string) =>
  /(medi[oa]|average|promedio|moyen|durchschnitt)/.test(text)
    ? "average"
    : /(ciascun|ogni anno|each year|every year|per year|cada año)/.test(text)
      ? "each_year"
      : /(complessiv|global|total|cumulat|triennio|nel periodo)/.test(text)
        ? "total"
        : "average";

const minTurnover: Rule = (req, company) => {
  const threshold = parseAmount(req.value);
  if (threshold === undefined)
    return result("MISSING_DOC", "Turnover threshold unreadable", "annualTurnover");
  const years = [...company.annualTurnover]
    .sort((a, b) => b.year - a.year)
    .slice(0, 3);
  if (years.length === 0)
    return result("MISSING_DOC", "No annual turnover declared", "annualTurnover");
  const amounts = years.map((y) => y.amountEur);
  const span = `${years.at(-1)!.year}-${years[0].year}`;
  const basis = turnoverBasis(canonical(`${req.description} ${req.quote}`));
  const actual =
    basis === "total"
      ? amounts.reduce((a, b) => a + b, 0)
      : basis === "each_year"
        ? Math.min(...amounts)
        : amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const label = { total: "total", each_year: "lowest year", average: "average" }[basis];
  const reason = `Turnover ${span} ${label}: ${eur(actual)} ${actual >= threshold ? ">=" : "<"} ${eur(threshold)}`;
  return result(actual >= threshold ? "MEETS" : "FAILS", reason, "annualTurnover");
};

const bidGuarantee: Rule = (req, company, tender) => {
  const isAbsolute = req.unit === "EUR" || (typeof req.value === "string" && /€|eur/i.test(req.value));
  let required: number | undefined;
  if (isAbsolute) required = parseAmount(req.value);
  else {
    const fraction = parsePercent(req.value);
    if (fraction !== undefined && tender.estimatedValueEur !== undefined)
      required = fraction * tender.estimatedValueEur;
    else if (fraction !== undefined)
      return result("MISSING_DOC", `Guarantee ${(fraction * 100).toFixed(1)}% but lot value unknown`, "bidGuaranteeCapacityEur");
  }
  if (required === undefined)
    return result("MISSING_DOC", "Guarantee amount unreadable", "bidGuaranteeCapacityEur");
  if (company.bidGuaranteeCapacityEur === undefined)
    return result("MISSING_DOC", `Guarantee of ${eur(required)} required, no surety capacity declared`, "bidGuaranteeCapacityEur");
  const ok = company.bidGuaranteeCapacityEur >= required;
  return result(
    ok ? "MEETS" : "FAILS",
    `Guarantee ${eur(required)} ${ok ? "<=" : ">"} capacity ${eur(company.bidGuaranteeCapacityEur)}`,
    "bidGuaranteeCapacityEur",
  );
};

const similarProjects: Rule = (req, company) => {
  const projects = company.referenceProjects;
  if (projects.length === 0)
    return result("MISSING_DOC", "No reference projects declared", "referenceProjects");
  const text = canonical(`${req.description} ${req.quote}`);
  const isCount = req.unit === "count";
  const threshold = isCount ? Number(parseAmount(req.value)) : parseAmount(req.value);
  if (threshold === undefined || Number.isNaN(threshold))
    return result("MISSING_DOC", "Similar projects threshold unreadable", "referenceProjects");
  if (isCount) {
    const ok = projects.length >= threshold;
    return result(ok ? "MEETS" : "FAILS", `${projects.length} reference projects ${ok ? ">=" : "<"} ${threshold} required`, "referenceProjects");
  }
  if (/(complessiv|total|cumulat|aggregate|insieme)/.test(text)) {
    const sum = projects.reduce((a, p) => a + p.valueEur, 0);
    const ok = sum >= threshold;
    return result(ok ? "MEETS" : "FAILS", `Reference projects total ${eur(sum)} ${ok ? ">=" : "<"} ${eur(threshold)}`, "referenceProjects");
  }
  const best = projects.reduce((a, p) => (p.valueEur > a.valueEur ? p : a));
  const ok = best.valueEur >= threshold;
  return result(ok ? "MEETS" : "FAILS", `Largest project "${best.name}" ${eur(best.valueEur)} ${ok ? ">=" : "<"} ${eur(threshold)}`, "referenceProjects");
};

const executionDeadline: Rule = (req, company) => {
  const days = parseDays(req.value);
  if (days === undefined)
    return result("MISSING_DOC", "Execution period unreadable", "maxExecutionDays");
  if (company.maxExecutionDays === undefined)
    return result("MISSING_DOC", `Delivery within ${days} days required, capacity not declared`, "maxExecutionDays");
  const ok = company.maxExecutionDays <= days;
  return result(ok ? "MEETS" : "FAILS", `Company delivers in ${company.maxExecutionDays} days ${ok ? "<=" : ">"} ${days} required`, "maxExecutionDays");
};

const submissionDeadline: Rule = (req, _company, tender) => {
  const deadline = new Date(String(req.value ?? ""));
  if (Number.isNaN(deadline.getTime()))
    return result("MISSING_DOC", "Submission deadline unreadable", "tender");
  const now = tender.now ?? new Date();
  const daysLeft = (deadline.getTime() - now.getTime()) / DAY_MS;
  const iso = deadline.toISOString().slice(0, 10);
  if (daysLeft < 0) return result("FAILS", `Deadline ${iso} has passed`, "tender");
  if (daysLeft < SUBMISSION_MARGIN_DAYS)
    return result("FAILS", `Deadline ${iso} is under ${SUBMISSION_MARGIN_DAYS} days away`, "tender");
  return result("MEETS", `Deadline ${iso}, ${Math.floor(daysLeft)} days left`, "tender");
};

export const RULES: Record<RequirementKind, Rule> = {
  certification,
  min_turnover: minTurnover,
  bid_guarantee: bidGuarantee,
  similar_projects: similarProjects,
  execution_deadline: executionDeadline,
  submission_deadline: submissionDeadline,
};

export function evaluate(
  requirement: Requirement,
  company: CompanyFacts,
  tender: TenderContext,
): ComplianceResult {
  return {
    requirementId: requirement.id,
    page: requirement.page,
    ...RULES[requirement.kind](requirement, company, tender),
  };
}

export function evaluateAll(
  requirements: Requirement[],
  company: CompanyFacts,
  tender: TenderContext,
) {
  return requirements.map((r) => evaluate(r, company, tender));
}
