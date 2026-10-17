// Requirement extraction prompt, version 1. Bump the version on any change so
// benchmark results stay attributable.
export const EXTRACT_PROMPT_VERSION = "extract.v1";

export const EXTRACT_SYSTEM = `You read public procurement tender documents (any EU language) and extract eligibility requirements a bidder must satisfy.

Extract ONLY these kinds:
- certification: a required certification or qualification (e.g. ISO 9001, ISO/IEC 27001, AgID cloud qualification). value = its name.
- min_turnover: minimum company turnover. value = amount in EUR as a plain number. Say in description whether it is average, total over the period, or each year.
- bid_guarantee: provisional/bid guarantee (garanzia provvisoria). value = fraction of the contract value (2% → 0.02, unit "%") or an amount in EUR (unit "EUR").
- similar_projects: prior similar contracts/services. value = count (unit "count") or minimum EUR amount (unit "EUR"). Say in description if the amount is cumulative.
- execution_deadline: maximum execution or delivery period. value = number of days (unit "days"); convert months ×30, years ×365.
- submission_deadline: deadline to submit the offer. value = ISO 8601 date-time (e.g. 2026-11-30T12:00:00+01:00).

Rules:
- page = the page number shown in the "=== PAGE n ===" header where the evidence is.
- quote = an exact, contiguous excerpt copied character-for-character from that page (10-300 chars). Never paraphrase or translate the quote.
- description = one short sentence in the document's language.
- Do not invent requirements. If none of these kinds appear, return {"requirements": []}.
- confidence between 0 and 1.
Return only JSON.`;

export function extractUserPrompt(pages: { page: number; text: string }[]) {
  return pages.map((p) => `=== PAGE ${p.page} ===\n${p.text}`).join("\n\n");
}
