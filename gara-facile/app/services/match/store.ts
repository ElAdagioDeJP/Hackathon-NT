import { desc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  businessRecords,
  contractMatches,
  contracts,
  submissions,
} from "../../db/schema";
import type { ContractModel, MatchModel, StoredMatch } from "./types";

export function createMatchStore(db: BetterSQLite3Database) {
  return {
    upsertContracts(models: ContractModel[]) {
      // All or nothing: a failed row must not leave a half-updated batch.
      db.transaction((tx) => {
        for (const model of models) {
          tx.insert(contracts)
            .values({
              id: model.id,
              title: model.title,
              url: model.url,
              description: model.description || null,
              placeCountries: model.placeCountries,
              cpvCodes: model.cpvCodes,
              deadline: model.deadline,
              buyerName: model.buyerName,
            })
            .onConflictDoUpdate({
              target: contracts.id,
              set: {
                title: model.title,
                url: model.url,
                description: model.description || null,
                placeCountries: model.placeCountries,
                cpvCodes: model.cpvCodes,
                deadline: model.deadline,
                buyerName: model.buyerName,
              },
            })
            .run();
        }
      });
    },

    // Returns false, writing nothing, when the profile is no longer the
    // approved version the run started from (approvedAt as an ISO string).
    replaceLedger(
      businessRecordId: number,
      matches: MatchModel[],
      approvedAt: string | null,
    ): boolean {
      return db.transaction((tx) => {
        const record = tx
          .select({
            status: businessRecords.status,
            approvedAt: businessRecords.approvedAt,
          })
          .from(businessRecords)
          .where(eq(businessRecords.id, businessRecordId))
          .get();
        if (
          record?.status !== "approved" ||
          (record.approvedAt?.toISOString() ?? null) !== approvedAt
        )
          return false;
        const existing = tx
          .select({ id: contractMatches.id })
          .from(contractMatches)
          .where(eq(contractMatches.businessRecordId, businessRecordId))
          .all();
        const matchIds = existing.map((row) => row.id);
        if (matchIds.length) {
          tx.delete(submissions)
            .where(inArray(submissions.contractMatchId, matchIds))
            .run();
          tx.delete(contractMatches)
            .where(eq(contractMatches.businessRecordId, businessRecordId))
            .run();
        }
        const matchedAt = new Date();
        for (const match of matches) {
          tx.insert(contractMatches)
            .values({
              contractId: match.contractId,
              businessRecordId: match.businessRecordId,
              type: match.type,
              score: match.score,
              rationale: match.rationale,
              matchedAt,
            })
            .run();
        }
        return true;
      });
    },

    list(businessRecordId: number): StoredMatch[] {
      return db
        .select({
          id: contractMatches.id,
          contractId: contractMatches.contractId,
          businessRecordId: contractMatches.businessRecordId,
          type: contractMatches.type,
          score: contractMatches.score,
          rationale: contractMatches.rationale,
          matchedAt: contractMatches.matchedAt,
          title: contracts.title,
          url: contracts.url,
          deadline: contracts.deadline,
          buyerName: contracts.buyerName,
        })
        .from(contractMatches)
        .innerJoin(contracts, eq(contractMatches.contractId, contracts.id))
        .where(eq(contractMatches.businessRecordId, businessRecordId))
        .orderBy(desc(contractMatches.score))
        .all()
        .map((row) => ({
          id: row.id,
          contractId: row.contractId,
          businessRecordId: row.businessRecordId,
          type: row.type,
          score: row.score,
          rationale: row.rationale,
          matchedAt: row.matchedAt?.toISOString() ?? null,
          title: row.title,
          url: row.url,
          deadline: row.deadline,
          buyerName: row.buyerName,
        }));
    },
  };
}

export type MatchStore = ReturnType<typeof createMatchStore>;
