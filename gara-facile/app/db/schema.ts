// src/db/schema.ts
import {
  sqliteTable,
  text,
  integer,
  blob,
  sqliteView,
} from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
import { EU_COUNTRY_CODES } from "../utils/constants";

// TABLES
export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
});

export const businesses = sqliteTable("businesses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
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
});

export const contractMatches = sqliteTable("contract_matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: text("contract_id")
    .notNull()
    .references(() => contracts.id),
  businessRecordId: integer("business_record_id")
    .notNull()
    .references(() => businessRecords.id),
  type: text("type", { enum: ["exact", "partial", "none"] }).default("none"),
  score: integer("score").default(0),
});

export const submissions = sqliteTable("submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractMatchId: integer("contract_match_id")
    .notNull()
    .references(() => contractMatches.id),
  content: blob("content", { mode: "buffer" }).notNull(),
  createdAt: integer("created_at").default(Math.floor(Date.now() / 1000)),
});

// VIEWS
export const wholeBusinessRecords = sqliteView("whole_business_records").as(
  (db) => {
    return db
      .select()
      .from(businesses)
      .leftJoin(businessRecords, eq(businesses.id, businessRecords.businessId));
  },
);
