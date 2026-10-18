import type { ContractModel, MatchModel, MatchType } from "./types";

const MATCH_TYPES = new Set<MatchType>(["exact", "partial", "none"]);

export class MatchParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchParseError";
  }
}

export function parseEvolusMatchResponse(
  content: string,
  contracts: ContractModel[],
  businessRecordId: number,
): MatchModel[] {
  const jsonText = extractJson(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new MatchParseError(
      "The Matching agent did not return valid JSON.",
    );
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.matches)
      ? parsed.matches
      : null;

  if (!rows) {
    throw new MatchParseError(
      'The Matching agent response must be a JSON array or { "matches": [...] }.',
    );
  }

  const byId = new Map<string, MatchModel>();
  for (const row of rows) {
    if (!isRecord(row)) {
      throw new MatchParseError("Each match must be a JSON object.");
    }
    // Check types before trimming: String() would turn objects, arrays and
    // null into plausible-looking values.
    const contractId =
      typeof row.contractId === "string" ? row.contractId.trim() : "";
    if (!contractId) {
      throw new MatchParseError("Each match needs a contractId.");
    }
    if (byId.has(contractId)) {
      throw new MatchParseError(
        `The Matching agent returned contract ${contractId} more than once.`,
      );
    }
    const type = (typeof row.type === "string" ? row.type.trim() : "") as MatchType;
    if (!MATCH_TYPES.has(type)) {
      throw new MatchParseError(
        `Invalid match type "${type}" for contract ${contractId}.`,
      );
    }
    const score = row.score;
    if (
      typeof score !== "number" ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > 100
    ) {
      throw new MatchParseError(
        `Score for contract ${contractId} must be an integer from 0 to 100.`,
      );
    }
    const rationale =
      typeof row.rationale === "string" ? row.rationale.trim() : "";
    if (!rationale) {
      throw new MatchParseError(
        `Rationale is required for contract ${contractId}.`,
      );
    }
    byId.set(contractId, {
      contractId,
      businessRecordId,
      type,
      score,
      rationale,
    });
  }

  const expected = new Set(contracts.map((contract) => contract.id));
  for (const id of expected) {
    if (!byId.has(id)) {
      throw new MatchParseError(
        `The Matching agent omitted contract ${id} from the results.`,
      );
    }
  }
  for (const id of byId.keys()) {
    if (!expected.has(id)) {
      throw new MatchParseError(
        `The Matching agent returned unknown contract ${id}.`,
      );
    }
  }

  return contracts.map((contract) => byId.get(contract.id)!);
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new MatchParseError("The Matching agent returned an empty reply.");
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);
  if (start === -1) {
    throw new MatchParseError(
      "The Matching agent reply did not contain a JSON payload.",
    );
  }
  return trimmed.slice(start);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
