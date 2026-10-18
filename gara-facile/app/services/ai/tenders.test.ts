import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { tenderAnalyses } from "@/app/db/schema";
import { AnalyzeError, FIXTURES_DIR } from "./analyze";
import { latestAnalyses, listTenders } from "./tenders";
import type { TenderAnalysis } from "./types";

const EXPECTED_IDS = ["629600-2026", "687674-2026", "691579-2026"];

function analysisFor(tenderId: string, score: number): TenderAnalysis {
  return {
    tenderId,
    results: [],
    score,
    verdict: "NO_GO",
    generatedBy: { model: "test", ms: 1 },
  };
}

function fixtureDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "./drizzle" });
  return { sqlite, db };
}

function assertAnalyzeErrorStatus(error: unknown, status: number) {
  assert.ok(error instanceof AnalyzeError, `expected AnalyzeError, got ${String(error)}`);
  assert.equal(error.status, status);
}

function assertIsoString(value: unknown): asserts value is string {
  assert.ok(typeof value === "string");
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(!Number.isNaN(Date.parse(value)), `${value} is not parseable as a date`);
}

test("lists exactly the 3 fixture tenders, never *.requirements.json, with titles and no pdf field", async () => {
  const tenders = await listTenders(FIXTURES_DIR);
  assert.deepEqual(
    tenders.map((tender) => tender.id).sort(),
    EXPECTED_IDS,
  );
  for (const tender of tenders) {
    assert.equal(typeof tender.title, "string");
    assert.ok(tender.title.length > 0, `${tender.id} has an empty title`);
    assert.ok(!tender.id.endsWith(".requirements.json"), `${tender.id} looks like a requirements file`);
    assert.ok(!("pdf" in tender), `${tender.id} must not expose the pdf field`);
  }
});

test("a corrupt JSON fixture throws AnalyzeError with status 500", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gara-tenders-corrupt-"));
  try {
    await writeFile(join(dir, "bad.json"), "{ not valid json", "utf8");
    await assert.rejects(listTenders(dir), (error) => {
      assertAnalyzeErrorStatus(error, 500);
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a missing dir throws AnalyzeError with status 503", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gara-tenders-missing-"));
  try {
    await assert.rejects(listTenders(join(dir, "does-not-exist")), (error) => {
      assertAnalyzeErrorStatus(error, 503);
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty dir lists no tenders", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gara-tenders-empty-"));
  try {
    assert.deepEqual(await listTenders(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("returns the latest row for businessRecordId 7, never rows from 8", () => {
  const f = fixtureDb();
  try {
    f.db.insert(tenderAnalyses).values({ tenderId: "691579-2026", businessRecordId: 7, analysis: analysisFor("691579-2026", 10) }).run();
    f.db.insert(tenderAnalyses).values({ tenderId: "691579-2026", businessRecordId: 7, analysis: analysisFor("691579-2026", 90) }).run();
    f.db.insert(tenderAnalyses).values({ tenderId: "691579-2026", businessRecordId: 8, analysis: analysisFor("691579-2026", 100) }).run();

    const latest = latestAnalyses(f.db, ["691579-2026"], 7);
    assert.equal(latest["691579-2026"].analysis?.score, 90);
    assertIsoString(latest["691579-2026"].analyzedAt);
  } finally {
    f.sqlite.close();
  }
});

test("with null returns only rows where businessRecordId IS NULL", () => {
  const f = fixtureDb();
  try {
    f.db.insert(tenderAnalyses).values({ tenderId: "629600-2026", businessRecordId: null, analysis: analysisFor("629600-2026", 42) }).run();
    f.db.insert(tenderAnalyses).values({ tenderId: "629600-2026", businessRecordId: 7, analysis: analysisFor("629600-2026", 99) }).run();

    const latest = latestAnalyses(f.db, ["629600-2026"], null);
    assert.equal(latest["629600-2026"].analysis?.score, 42);
    assertIsoString(latest["629600-2026"].analyzedAt);

    const scoped = latestAnalyses(f.db, ["629600-2026"], 7);
    assert.equal(scoped["629600-2026"].analysis?.score, 99);
  } finally {
    f.sqlite.close();
  }
});

test("a tender with no rows returns null analysis and null analyzedAt", () => {
  const f = fixtureDb();
  try {
    const latest = latestAnalyses(f.db, ["687674-2026"], 7);
    assert.deepEqual(latest["687674-2026"], { analysis: null, analyzedAt: null });
    const demo = latestAnalyses(f.db, ["687674-2026"], null);
    assert.deepEqual(demo["687674-2026"], { analysis: null, analyzedAt: null });
  } finally {
    f.sqlite.close();
  }
});

// NOTE: route tests for app/api/ai/tenders/route.ts are intentionally
// skipped. The route pulls `connection` from next/server, authorizes the
// profile via cookies/DB, and dynamically imports the production db, so
// exercising it outside a running server would need heavy mocking.
