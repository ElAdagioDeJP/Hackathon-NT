import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { EMPTY_PROFILE } from "../../business-profile/types";
import { createProfileService } from "../business/profiles";
import { createMatchService } from "./find-matches";
import type { ContractModel } from "./types";

const complete = {
  ...EMPTY_PROFILE,
  name: "Voltio Electrical",
  country: "ESP",
  city: "Valencia",
  offerings: "Electrical installation.",
  coverageScope: "national" as const,
  capacity: "A team of 8.",
  experienceLevel: "starting" as const,
};

const candidates: ContractModel[] = [
  {
    id: "TED-A",
    title: "Good fit",
    url: "https://example.test/a",
    description: "Electrical works",
    placeCountries: ["ESP"],
    cpvCodes: ["45310000"],
    deadline: "2026-11-01",
    buyerName: "Buyer A",
  },
  {
    id: "TED-B",
    title: "No fit",
    url: "https://example.test/b",
    description: "Catering",
    placeCountries: ["ESP"],
    cpvCodes: [],
    deadline: null,
    buyerName: null,
  },
];

function fixture() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "./drizzle" });
  return {
    sqlite,
    db,
    profiles: createProfileService(db),
  };
}

test("find matches upserts contracts, replaces the ledger, and keeps contracts when Evolus fails", async () => {
  const f = fixture();
  try {
    const saved = f.profiles.save(undefined, complete, true, true);
    const token = saved.newToken!;

    const service = createMatchService(f.db, {
      searchNotices: async () => candidates,
      requestMatches: async () =>
        JSON.stringify({
          matches: [
            {
              contractId: "TED-A",
              type: "exact",
              score: 88,
              rationale: "Same trade and place.",
            },
            {
              contractId: "TED-B",
              type: "none",
              score: 5,
              rationale: "Unrelated sector.",
            },
          ],
        }),
    });

    const first = await service.findMatches(token);
    assert.equal(first.length, 2);
    assert.equal(first[0].contractId, "TED-A");
    assert.equal(first[0].score, 88);

    const replaced = createMatchService(f.db, {
      searchNotices: async () => [candidates[0]],
      requestMatches: async () =>
        JSON.stringify({
          matches: [
            {
              contractId: "TED-A",
              type: "partial",
              score: 55,
              rationale: "Still relevant.",
            },
          ],
        }),
    });
    const second = await replaced.findMatches(token);
    assert.equal(second.length, 1);
    assert.equal(second[0].type, "partial");

    const failing = createMatchService(f.db, {
      searchNotices: async () => candidates,
      requestMatches: async () => {
        throw new Error("network down");
      },
    });
    await assert.rejects(() => failing.findMatches(token), /could not be reached/i);
    const afterFailure = failing.list(token);
    assert.equal(afterFailure.length, 1);
    assert.equal(afterFailure[0].type, "partial");
    assert.equal(
      f.sqlite.prepare("SELECT count(*) AS c FROM contracts").get().c,
      2,
    );
  } finally {
    f.sqlite.close();
  }
});

test("find matches requires an approved profile", async () => {
  const f = fixture();
  try {
    const draft = f.profiles.save(undefined, complete, false);
    const service = createMatchService(f.db, {
      searchNotices: async () => candidates,
      requestMatches: async () => '{"matches":[]}',
    });
    await assert.rejects(
      () => service.findMatches(draft.newToken),
      /Approve your business profile/,
    );
  } finally {
    f.sqlite.close();
  }
});
