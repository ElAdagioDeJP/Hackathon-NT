import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  businesses,
  businessProfileSessions,
  businessRecords,
  contractMatches,
} from "../../db/schema";
import { parseProfile } from "../../business-profile/validation";
import type { ProfileErrors, SavedProfile } from "../../business-profile/types";

export const PROFILE_COOKIE = "gara_profile_session";
export const PROFILE_SESSION_SECONDS = 30 * 24 * 60 * 60;
export class ProfileError extends Error {
  constructor(
    message: string,
    readonly fields?: ProfileErrors,
  ) {
    super(message);
    this.name = "ProfileError";
  }
}
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function createProfileService(db: BetterSQLite3Database) {
  function session(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return (
      db
        .select()
        .from(businessProfileSessions)
        .where(
          and(
            eq(businessProfileSessions.tokenHash, hash(token)),
            gt(businessProfileSessions.expiresAt, new Date()),
          ),
        )
        .get() ?? null
    );
  }
  function read(recordId: number): SavedProfile {
    const record = db
      .select()
      .from(businessRecords)
      .where(eq(businessRecords.id, recordId))
      .get();
    if (!record)
      throw new ProfileError("Your saved profile could not be found.");
    const business = db
      .select()
      .from(businesses)
      .where(eq(businesses.id, record.businessId))
      .get()!;
    return {
      recordId,
      status: record.status,
      approvedAt: record.approvedAt?.toISOString() ?? null,
      profile: {
        name: business.name,
        country: business.country,
        city: business.city,
        offerings: record.offerings ?? "",
        coverageScope: record.coverageScope ?? "",
        coverageCountries: record.coverageCountries,
        capacity: record.capacity ?? "",
        experienceLevel: record.experienceLevel ?? "experienced",
        experience: record.experience ?? "",
      },
    };
  }
  return {
    owns(token: string | undefined, recordId: number) {
      return session(token)?.businessRecordId === recordId;
    },
    get(token?: string) {
      const current = session(token);
      return current ? read(current.businessRecordId) : null;
    },
    save(
      token: string | undefined,
      input: unknown,
      complete: boolean,
      approve = false,
      // The saved profile the browser is editing; undefined starts a new one.
      editingRecordId?: number,
    ) {
      const { profile, errors } = parseProfile(input, complete || approve);
      if (Object.keys(errors).length)
        throw new ProfileError("Please check the highlighted fields.", errors);
      const current = session(token);
      // An expired/stale cookie must not silently turn an edit into a new company.
      if (
        (token && !current) ||
        (editingRecordId !== undefined &&
          current?.businessRecordId !== editingRecordId)
      )
        throw new ProfileError(
          "Your session has expired. Reload the page to start a new profile.",
        );
      const newToken = current ? undefined : randomBytes(32).toString("hex");
      const recordId = db.transaction(
        (tx) => {
          let id = current?.businessRecordId;
          const data = {
            offerings: profile.offerings,
            coverageScope: profile.coverageScope || null,
            coverageCountries: profile.coverageCountries,
            capacity: profile.capacity,
            experienceLevel: profile.experienceLevel,
            experience: profile.experience,
            status: approve ? ("approved" as const) : ("draft" as const),
            approvedAt: approve ? new Date() : null,
            updatedAt: new Date(),
          };
          if (id) {
            if (
              tx
                .select({ id: contractMatches.id })
                .from(contractMatches)
                .where(eq(contractMatches.businessRecordId, id))
                .get()
            )
              throw new ProfileError(
                "This profile is already used for matching. A new profile version is required before editing it.",
              );
            const record = tx
              .select()
              .from(businessRecords)
              .where(eq(businessRecords.id, id))
              .get()!;
            tx.update(businesses)
              .set({
                name: profile.name,
                country: profile.country,
                city: profile.city,
              })
              .where(eq(businesses.id, record.businessId))
              .run();
            tx.update(businessRecords)
              .set(data)
              .where(eq(businessRecords.id, id))
              .run();
          } else {
            const business = tx
              .insert(businesses)
              .values({
                name: profile.name,
                country: profile.country,
                city: profile.city,
              })
              .returning()
              .get();
            id = tx
              .insert(businessRecords)
              .values({ businessId: business.id, ...data })
              .returning()
              .get().id;
            tx.insert(businessProfileSessions)
              .values({
                tokenHash: hash(newToken!),
                businessRecordId: id,
                expiresAt: new Date(
                  Date.now() + PROFILE_SESSION_SECONDS * 1000,
                ),
              })
              .run();
          }
          return id;
        },
        { behavior: "immediate" },
      );
      return { saved: read(recordId), newToken };
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
