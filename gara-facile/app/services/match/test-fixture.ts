// Shared data for the match service tests (not a test file itself).
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { EMPTY_PROFILE } from "../../business-profile/types";
import { createProfileService } from "../business/profiles";
import type { ContractModel } from "./types";

export const complete = {
  ...EMPTY_PROFILE,
  name: "Voltio Electrical",
  country: "ESP",
  city: "Valencia",
  offerings: "Electrical installation.",
  coverageScope: "national" as const,
  capacity: "A team of 8.",
  experienceLevel: "starting" as const,
};

export const candidates: ContractModel[] = [
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

export function fixture() {
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
