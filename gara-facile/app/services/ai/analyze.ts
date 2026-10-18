// Orchestrates pdf → extract → company facts → rules → score.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractRequirements, type ExtractionStats } from "./extract";
import { loadTenderPages } from "./pdf";
import { evaluateAll } from "./rules";
import { score, verdict } from "./scoring";
import type { CompanyFacts, Requirement, TenderAnalysis } from "./types";

export const FIXTURES_DIR = join(process.cwd(), "fixtures", "tenders");

// Notice metadata stored next to each fixture PDF as <tenderId>.json.
export interface TenderFixture {
  tenderId: string;
  title: string;
  lotId?: string;
  estimatedValueEur?: number;
  country?: string;
  language?: string;
  pdf: string; // file name inside fixtures/tenders
  noticeUrl?: string;
  documentUrl?: string;
}

export class AnalyzeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AnalyzeError";
  }
}

export async function loadFixture(tenderId: string) {
  if (!/^[\w.-]+$/.test(tenderId)) throw new AnalyzeError("Invalid tenderId.");
  const raw = await readFile(join(FIXTURES_DIR, `${tenderId}.json`), "utf8").catch(() => {
    throw new AnalyzeError(`Tender ${tenderId} not found.`, 404);
  });
  const fixture = JSON.parse(raw) as TenderFixture;
  const bytes = new Uint8Array(await readFile(join(FIXTURES_DIR, fixture.pdf)));
  return { fixture, bytes };
}

export interface AnalyzeOutput {
  analysis: TenderAnalysis;
  requirements: Requirement[];
  stats: ExtractionStats;
}

// Saved, reviewed requirements win over live extraction: the LLM extraction is
// nondeterministic, so re-running it can silently change the verdict.
export async function loadSavedRequirements(
  tenderId: string,
  dir = FIXTURES_DIR,
): Promise<{ requirements: Requirement[]; stats: ExtractionStats } | null> {
  const raw = await readFile(join(dir, `${tenderId}.requirements.json`), "utf8").catch(() => null);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { requirements?: unknown; stats?: unknown };
    if (!parsed || !Array.isArray(parsed.requirements)) return null;
    return {
      requirements: parsed.requirements as Requirement[],
      stats: parsed.stats as ExtractionStats,
    };
  } catch {
    return null;
  }
}

export async function analyzeTender(input: {
  tenderId: string;
  company: CompanyFacts;
  now?: Date;
  signal?: AbortSignal;
  extract?: typeof extractRequirements;
}): Promise<AnalyzeOutput> {
  const started = performance.now();
  const { fixture, bytes } = await loadFixture(input.tenderId);
  let requirements: Requirement[];
  let stats: ExtractionStats;
  if (input.extract) {
    const { pages } = await loadTenderPages(bytes, { tenderId: fixture.tenderId, source: fixture.pdf });
    ({ requirements, stats } = await input.extract(pages, {
      signal: input.signal,
    }));
  } else {
    const saved = await loadSavedRequirements(fixture.tenderId);
    if (saved) {
      ({ requirements, stats } = saved);
    } else {
      const { pages } = await loadTenderPages(bytes, { tenderId: fixture.tenderId, source: fixture.pdf });
      ({ requirements, stats } = await extractRequirements(pages, {
        signal: input.signal,
      }));
    }
  }
  const results = evaluateAll(requirements, input.company, {
    tenderId: fixture.tenderId,
    lotId: fixture.lotId,
    estimatedValueEur: fixture.estimatedValueEur,
    now: input.now,
  });
  const analysis: TenderAnalysis = {
    tenderId: fixture.tenderId,
    lotId: fixture.lotId,
    results,
    score: score(requirements, results),
    verdict: verdict(results),
    generatedBy: {
      model: stats.model ?? "unknown",
      ms: Math.round(performance.now() - started),
      tokens: stats.promptTokens + stats.completionTokens,
    },
  };
  return { analysis, requirements, stats };
}

export async function saveAnalysis(analysis: TenderAnalysis, businessRecordId?: number) {
  if (!process.env.DB_FILE_NAME) return;
  const [{ db }, { tenderAnalyses }] = await Promise.all([import("../../db"), import("../../db/schema")]);
  db.insert(tenderAnalyses)
    .values({ tenderId: analysis.tenderId, businessRecordId, analysis })
    .run();
}
