import { desc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  contractMatches,
  contracts,
  submissions,
} from "../../db/schema";
import type { ContractModel, MatchModel, StoredMatch } from "./types";

export function createMatchStore(db: BetterSQLite3Database) {
  return {
    upsertContracts(models: ContractModel[]) {
      for (const model of models) {
        db.insert(contracts)
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
    },

    replaceLedger(businessRecordId: number, matches: MatchModel[]) {
      db.transaction((tx) => {
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

    listVisible(businessRecordId: number): StoredMatch[] {
      return this.list(businessRecordId).filter(
        (match) => match.type !== "none",
      );
    },

  };
}

export type MatchStore = ReturnType<typeof createMatchStore>;
