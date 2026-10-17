// Tender pages → Requirement[] via the extract model. Every requirement must be
// backed by a quote that literally appears on a page; anything else is dropped.
import { z } from "zod";
import { chat as defaultChat } from "./llm";
import { canonical, parseAmount, parseDays, parsePercent } from "./normalize";
import { EXTRACT_SYSTEM, extractUserPrompt } from "./prompts/extract.v1";
import { REQUIREMENT_KINDS, type Requirement, type RequirementKind, type TenderPage } from "./types";

export const WINDOW_PAGES = 7;
// AMD Token Factory allows 8 concurrent requests and 20 RPM per team key.
export const CONCURRENCY = 3;
// Thinking models spend part of the budget reasoning before the JSON.
export const MAX_TOKENS = 16_000;

const rawRequirement = z.object({
  kind: z.enum(REQUIREMENT_KINDS as [RequirementKind, ...RequirementKind[]]),
  description: z.string(),
  value: z.union([z.number(), z.string()]).nullable().optional(),
  unit: z.string().nullable().optional(),
  page: z.number().int(),
  quote: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});
export const extractionSchema = z.object({ requirements: z.array(rawRequirement) });
type RawRequirement = z.infer<typeof rawRequirement>;
type Chat = typeof defaultChat;

export function windows(pages: TenderPage[], size = WINDOW_PAGES) {
  const usable = pages.filter((p) => !p.needsOcr);
  const out: TenderPage[][] = [];
  for (let i = 0; i < usable.length; i += size) out.push(usable.slice(i, i + size));
  return out;
}

const squash = (text: string) => canonical(text).replace(/[\s-]+/g, "");

// The page whose text literally contains the quote: the claimed page first, then the window.
export function locateQuote(quote: string, claimedPage: number, pages: TenderPage[]) {
  const needle = squash(quote);
  if (needle.length < 8) return undefined;
  const ordered = [...pages].sort(
    (a, b) => Number(b.page === claimedPage) - Number(a.page === claimedPage),
  );
  return ordered.find((p) => squash(p.text).includes(needle))?.page;
}

export function normalizeValue(raw: RawRequirement): Pick<Requirement, "value" | "unit"> | undefined {
  const unit = raw.unit?.trim() || undefined;
  const value = raw.value ?? undefined;
  switch (raw.kind) {
    case "certification":
      return value === undefined ? undefined : { value: String(value).trim() };
    case "min_turnover": {
      const n = parseAmount(value);
      return n === undefined ? undefined : { value: n, unit: "EUR" };
    }
    case "bid_guarantee": {
      const isEur = unit?.toUpperCase() === "EUR" || (typeof value === "string" && /€|eur/i.test(value));
      const n = isEur ? parseAmount(value) : parsePercent(value);
      return n === undefined ? undefined : { value: n, unit: isEur ? "EUR" : "%" };
    }
    case "similar_projects": {
      const n = parseAmount(value);
      if (n === undefined) return undefined;
      const isCount = unit === "count" || (unit !== "EUR" && n < 100);
      return { value: n, unit: isCount ? "count" : "EUR" };
    }
    case "execution_deadline": {
      const n = parseDays(unit && typeof value === "number" ? `${value} ${unit}` : value);
      return n === undefined ? undefined : { value: n, unit: "days" };
    }
    case "submission_deadline": {
      const date = new Date(String(value ?? ""));
      return Number.isNaN(date.getTime()) ? undefined : { value: date.toISOString() };
    }
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

export interface ExtractionStats {
  windows: number;
  failedWindows: number;
  raw: number;
  droppedNoQuote: number;
  droppedBadValue: number;
  duplicates: number;
  ms: number;
  promptTokens: number;
  completionTokens: number;
  model?: string;
}

export async function extractRequirements(
  pages: TenderPage[],
  options: { chat?: Chat; signal?: AbortSignal } = {},
): Promise<{ requirements: Requirement[]; stats: ExtractionStats }> {
  const chat = options.chat ?? defaultChat;
  const started = performance.now();
  const stats: ExtractionStats = {
    windows: 0, failedWindows: 0, raw: 0, droppedNoQuote: 0, droppedBadValue: 0, duplicates: 0, ms: 0,
    promptTokens: 0, completionTokens: 0,
  };
  const groups = windows(pages);
  stats.windows = groups.length;

  let lastError: unknown;
  const perWindow = await mapLimit(groups, CONCURRENCY, async (group) => {
    // One slow or malformed window must not lose the whole tender.
    const out = await chat({
      role: "extract",
      schema: extractionSchema,
      schemaName: "requirements",
      maxTokens: MAX_TOKENS,
      signal: options.signal,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content: extractUserPrompt(group) },
      ],
    }).catch((error: unknown) => {
      if (options.signal?.aborted) throw error;
      stats.failedWindows++;
      lastError = error;
      return null;
    });
    if (!out) return [];
    stats.promptTokens += out.promptTokens ?? 0;
    stats.completionTokens += out.completionTokens ?? 0;
    stats.model = out.model;
    return out.data.requirements.map((r) => ({ raw: r, group }));
  });

  if (groups.length > 0 && stats.failedWindows === groups.length) throw lastError;

  const best = new Map<string, Requirement>();
  for (const { raw, group } of perWindow.flat()) {
    stats.raw++;
    const page = raw.quote ? locateQuote(raw.quote, raw.page, group) : undefined;
    if (page === undefined) {
      stats.droppedNoQuote++;
      continue;
    }
    const normalized = normalizeValue(raw);
    if (!normalized) {
      stats.droppedBadValue++;
      continue;
    }
    const requirement: Requirement = {
      id: "",
      kind: raw.kind,
      description: raw.description.trim(),
      ...normalized,
      page,
      quote: raw.quote.trim(),
      confidence: raw.confidence ?? 0.5,
    };
    const key = `${raw.kind}:${canonical(String(requirement.value))}`;
    const existing = best.get(key);
    if (existing) stats.duplicates++;
    if (!existing || requirement.confidence > existing.confidence) best.set(key, requirement);
  }

  const counts: Partial<Record<RequirementKind, number>> = {};
  const requirements = [...best.values()]
    .sort((a, b) => a.page - b.page || a.kind.localeCompare(b.kind))
    .map((r) => {
      counts[r.kind] = (counts[r.kind] ?? 0) + 1;
      return { ...r, id: `${r.kind}-${counts[r.kind]}` };
    });
  stats.ms = Math.round(performance.now() - started);
  return { requirements, stats };
}
