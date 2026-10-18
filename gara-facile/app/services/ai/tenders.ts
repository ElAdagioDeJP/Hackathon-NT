// Lists demo tenders from the fixture directory and attaches the latest
// saved analysis per tender. Pure logic lives here so it is unit-testable;
// the route in app/api/ai/tenders/route.ts stays thin.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { db } from "@/app/db";
import { tenderAnalyses } from "@/app/db/schema";
import { AnalyzeError } from "./analyze";
import type { TenderAnalysis } from "./types";

// Summary fields shown by the /tenders UI. Mirrors the TenderFixture shape
// (plus the deadline stored next to it); never invents fields.
export interface TenderSummary {
  id: string;
  title: string;
  lotId?: string;
  estimatedValueEur?: number;
  country?: string;
  language?: string;
  deadline?: string;
  noticeUrl?: string;
  documentUrl?: string;
}

export interface LatestAnalysis {
  analysis: TenderAnalysis | null;
  analyzedAt: string | null;
}

// Reads every <id>.json fixture in dir (skipping *.requirements.json) and
// returns one summary per tender. Reads only the JSON metadata, never the
// PDF bytes.
export async function listTenders(dir: string): Promise<TenderSummary[]> {
  const entries = await readdir(dir).catch(() => {
    throw new AnalyzeError("Tenders are not available.", 503);
  });
  const files = entries
    .filter((entry) => entry.endsWith(".json") && !entry.endsWith(".requirements.json"))
    .sort();
  const tenders: TenderSummary[] = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), "utf8").catch(() => {
      throw new AnalyzeError(`Tender ${file} is unreadable.`, 500);
    });
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new AnalyzeError(`Tender ${file} is unreadable.`, 500);
    }
    if (typeof parsed.tenderId !== "string" || typeof parsed.title !== "string")
      throw new AnalyzeError(`Tender ${file} is unreadable.`, 500);
    const summary: TenderSummary = { id: parsed.tenderId, title: parsed.title };
    if (typeof parsed.lotId === "string") summary.lotId = parsed.lotId;
    if (typeof parsed.estimatedValueEur === "number") summary.estimatedValueEur = parsed.estimatedValueEur;
    if (typeof parsed.country === "string") summary.country = parsed.country;
    if (typeof parsed.language === "string") summary.language = parsed.language;
    if (typeof parsed.deadline === "string") summary.deadline = parsed.deadline;
    if (typeof parsed.noticeUrl === "string") summary.noticeUrl = parsed.noticeUrl;
    if (typeof parsed.documentUrl === "string") summary.documentUrl = parsed.documentUrl;
    tenders.push(summary);
  }
  return tenders;
}

// Latest tenderAnalyses row per tender id, scoped to one profile (a number)
// or to the demo company (null → businessRecordId IS NULL). Never mixes
// analyses across profiles.
export function latestAnalyses(
  database: typeof db,
  ids: string[],
  businessRecordId: number | null,
): Record<string, LatestAnalysis> {
  const latest: Record<string, LatestAnalysis> = {};
  for (const tenderId of ids) {
    const row = database
      .select()
      .from(tenderAnalyses)
      .where(
        businessRecordId === null
          ? and(eq(tenderAnalyses.tenderId, tenderId), isNull(tenderAnalyses.businessRecordId))
          : and(eq(tenderAnalyses.tenderId, tenderId), eq(tenderAnalyses.businessRecordId, businessRecordId)),
      )
      .orderBy(desc(tenderAnalyses.id))
      .limit(1)
      .get();
    if (!row) {
      latest[tenderId] = { analysis: null, analyzedAt: null };
      continue;
    }
    const createdAt = row.createdAt as Date | string | number | null | undefined;
    latest[tenderId] = {
      analysis: row.analysis as TenderAnalysis,
      analyzedAt:
        createdAt instanceof Date
          ? createdAt.toISOString()
          : createdAt != null
            ? new Date(createdAt).toISOString()
            : null,
    };
  }
  return latest;
}
