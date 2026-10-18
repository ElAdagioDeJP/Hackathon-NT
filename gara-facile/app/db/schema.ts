// src/db/schema.ts
import {
  sqliteTable,
  text,
  integer,
  blob,
  sqliteView,
  index,
} from "drizzle-orm/sqlite-core";
import { eq, sql } from "drizzle-orm";
import { EU_COUNTRY_CODES } from "../utils/constants";

// TABLES
export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  placeCountries: text("place_countries", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  cpvCodes: text("cpv_codes", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  deadline: text("deadline"),
  buyerName: text("buyer_name"),
});

export const businesses = sqliteTable("businesses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // Contact details can be completed later or supplied by the user account.
  email: text("email"),
  phone: text("phone"),
  country: text("country", {
    enum: EU_COUNTRY_CODES as [string, ...string[]],
  }).notNull(),
  city: text("city").notNull(),
});

export const businessRecords = sqliteTable("business_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessId: integer("business_id")
    .notNull()
    .references(() => businesses.id),
  // One record is a version of a business profile. Matches reference that version.
  offerings: text("offerings"),
  coverageScope: text("coverage_scope", {
    enum: ["local", "national", "international"],
  }),
  coverageCountries: text("coverage_countries", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  capacity: text("capacity"),
  experienceLevel: text("experience_level", {
    enum: ["experienced", "starting"],
  }),
  experience: text("experience"),
  cpvCodes: text("cpv_codes", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  certifications: text("certifications", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  languages: text("languages", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  contextSummary: text("context_summary"),
  status: text("status", { enum: ["draft", "pending_review", "approved"] })
    .notNull()
    .default("draft"),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Store file metadata here. File bytes will live outside SQLite.
// A relative storage key can later identify either a server file or an object.
export const businessDocuments = sqliteTable(
  "business_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    businessRecordId: integer("business_record_id")
      .notNull()
      .references(() => businessRecords.id),
    category: text("category", { enum: ["context", "legal"] }).notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    storageProvider: text("storage_provider", { enum: ["local", "r2"] })
      .notNull()
      .default("local"),
    storageBucket: text("storage_bucket"),
    extractedText: text("extracted_text"),
    processingStatus: text("processing_status", {
      enum: ["pending", "processed", "failed"],
    })
      .notNull()
      .default("pending"),
    // An uploaded document is not automatically proof of eligibility.
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    uploadedAt: integer("uploaded_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("business_documents_record_idx").on(table.businessRecordId),
  ],
);

// Anonymous browser ownership until account-based authentication is introduced.
// Store a digest only; the opaque capability is held in an HttpOnly cookie.
export const businessProfileSessions = sqliteTable(
  "business_profile_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    businessRecordId: integer("business_record_id")
      .notNull()
      .references(() => businessRecords.id),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
);

export const contractMatches = sqliteTable("contract_matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: text("contract_id")
    .notNull()
    .references(() => contracts.id),
  businessRecordId: integer("business_record_id")
    .notNull()
    .references(() => businessRecords.id),
  type: text("type", { enum: ["exact", "partial", "none"] })
    .notNull()
    .default("none"),
  score: integer("score").notNull().default(0),
  rationale: text("rationale").notNull().default(""),
  // When the Find matches run that wrote this row finished. Null for rows
  // written before the column existed.
  matchedAt: integer("matched_at", { mode: "timestamp" }),
});

export const submissions = sqliteTable("submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractMatchId: integer("contract_match_id")
    .notNull()
    .references(() => contractMatches.id),
  content: blob("content", { mode: "buffer" }).notNull(),
  createdAt: integer("created_at").default(sql`(unixepoch())`),
});

// AI: one row per LLM call. Feeds the AMD panel (/api/ai/amd-stats).
export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    role: text("role", { enum: ["extract", "draft"] }).notNull(),
    model: text("model").notNull(),
    ms: integer("ms").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("ai_runs_created_idx").on(table.createdAt)],
);

// Parsed tender PDFs, keyed by content hash so a file is parsed once.
export const tenderDocuments = sqliteTable("tender_documents", {
  hash: text("hash").primaryKey(),
  tenderId: text("tender_id").notNull(),
  source: text("source").notNull(),
  pages: text("pages", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// TenderAnalysis JSON until contract_matches is extended with backend.
export const tenderAnalyses = sqliteTable(
  "tender_analyses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenderId: text("tender_id").notNull(),
    businessRecordId: integer("business_record_id"),
    analysis: text("analysis", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("tender_analyses_tender_idx").on(table.tenderId)],
);

// VIEWS
export const wholeBusinessRecords = sqliteView("whole_business_records").as(
  (db) => {
    return db
      .select()
      .from(businesses)
      .leftJoin(businessRecords, eq(businesses.id, businessRecords.businessId));
  },
);
