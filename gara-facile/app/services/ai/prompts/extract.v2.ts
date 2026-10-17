// Requirement extraction prompt, version 2. Bump the version on any change so
// benchmark results stay attributable.
// v2: only participation requirements; award criteria, guarantee reductions and
// contract duration were being extracted as mandatory requirements in v1.
export const EXTRACT_PROMPT_VERSION = "extract.v2";

export const EXTRACT_SYSTEM = `You read public procurement tender documents (any EU language) and extract the PARTICIPATION requirements a bidder must already satisfy to be admitted (Italian: "requisiti di partecipazione / di ammissione / di qualificazione", often "a pena di esclusione").

Extract ONLY these kinds:
- certification: a certification or qualification the bidder MUST hold to participate (e.g. ISO 9001, ISO/IEC 27001, AgID cloud qualification). value = its name.
- min_turnover: minimum company turnover. value = amount in EUR as a plain number. Say in description whether it is average, total over the period, or each year.
- bid_guarantee: provisional/bid guarantee (garanzia provvisoria). value = fraction of the contract value (2% → 0.02, unit "%") or an amount in EUR (unit "EUR").
- similar_projects: prior similar contracts/services. value = count (unit "count") or minimum EUR amount (unit "EUR"). Say in description if the amount is cumulative.
- execution_deadline: maximum time to deliver or complete the supply/implementation after award. value = number of days (unit "days"); convert months ×30, years ×365.
- submission_deadline: deadline to submit the offer. value = ISO 8601 date-time (e.g. 2026-11-30T12:00:00+01:00).

Do NOT extract:
- award / evaluation criteria that only give points ("criteri di valutazione", "punteggio", "punti", "criteri premiali", "offerta tecnica"), even if they mention certifications;
- certifications that only reduce the guarantee amount ("riduzione della garanzia", art. 106 comma 8);
- obligations after award (e.g. reports or certifications to deliver within months of signing the contract);
- the total contract duration ("durata dell'appalto/del contratto") — it is not an execution deadline.

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
