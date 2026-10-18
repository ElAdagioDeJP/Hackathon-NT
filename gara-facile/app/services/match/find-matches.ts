import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { TedApiError } from "../TED/fetch";
import { createProfileService } from "../business/profiles";
import { EvolusApiError, requestEvolusMatches } from "./evolus";
import { MatchParseError, parseEvolusMatchResponse } from "./parse-matches";
import { createMatchStore } from "./store";
import { fetchCandidateContracts } from "./ted-candidates";
import { toBusinessModel, type StoredMatch } from "./types";

export class MatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchError";
  }
}

// A hung TED or Evolus call must not keep the Find matches action open.
export const TED_TIMEOUT_MS = 20_000;
export const EVOLUS_TIMEOUT_MS = 90_000;

export interface FindMatchesDeps {
  searchNotices?: typeof fetchCandidateContracts;
  requestMatches?: typeof requestEvolusMatches;
  tedTimeoutMs?: number;
  evolusTimeoutMs?: number;
}

export function createMatchService(
  db: BetterSQLite3Database,
  deps: FindMatchesDeps = {},
) {
  const profiles = createProfileService(db);
  const store = createMatchStore(db);
  const loadCandidates = deps.searchNotices ?? fetchCandidateContracts;
  const askEvolus = deps.requestMatches ?? requestEvolusMatches;
  const tedTimeoutMs = deps.tedTimeoutMs ?? TED_TIMEOUT_MS;
  const evolusTimeoutMs = deps.evolusTimeoutMs ?? EVOLUS_TIMEOUT_MS;

  return {
    profile(token: string | undefined) {
      return profiles.get(token);
    },

    list(token: string | undefined): StoredMatch[] {
      const saved = profiles.get(token);
      if (!saved) return [];
      return store.list(saved.recordId);
    },

    async findMatches(token: string | undefined): Promise<StoredMatch[]> {
      const saved = profiles.get(token);
      if (!saved) {
        throw new MatchError(
          "No saved profile was found for this browser session.",
        );
      }
      if (saved.status !== "approved") {
        throw new MatchError(
          "Approve your business profile before Finding matches.",
        );
      }

      const business = toBusinessModel(saved.profile);

      let candidates;
      try {
        candidates = await loadCandidates(business, {
          signal: AbortSignal.timeout(tedTimeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) {
          throw new MatchError("TED did not answer in time. Please try again.");
        }
        if (error instanceof TedApiError || error instanceof MatchError) {
          throw new MatchError(publicTedMessage(error));
        }
        throw new MatchError(
          "Could not load contracts from TED. Please try again.",
        );
      }

      if (!candidates.length) {
        throw new MatchError(
          "No active TED notices were found for your coverage area.",
        );
      }

      store.upsertContracts(candidates);

      let content: string;
      try {
        content = await askEvolus(business, candidates, {
          signal: AbortSignal.timeout(evolusTimeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) {
          throw new MatchError(
            "The Matching agent did not answer in time. Please try again.",
          );
        }
        if (error instanceof EvolusApiError) {
          throw new MatchError(error.message);
        }
        throw new MatchError(
          "The Matching agent could not be reached. Please try again.",
        );
      }

      let matches;
      try {
        matches = parseEvolusMatchResponse(
          content,
          candidates,
          saved.recordId,
        );
      } catch (error) {
        if (error instanceof MatchParseError) {
          throw new MatchError(error.message);
        }
        throw new MatchError(
          "The Matching agent returned a response that could not be used.",
        );
      }

      if (!store.replaceLedger(saved.recordId, matches, saved.approvedAt)) {
        throw new MatchError(
          "Your profile changed while Matching was running. Approve it and Find matches again.",
        );
      }
      return store.list(saved.recordId);
    },
  };
}

export type MatchService = ReturnType<typeof createMatchService>;

function publicTedMessage(error: Error): string {
  if (error instanceof TedApiError && error.message.includes("EU_API_KEY")) {
    return "TED search is not configured. Set EU_API_KEY on the server.";
  }
  if (error instanceof MatchError) return error.message;
  return "Could not load contracts from TED. Please try again.";
}

// Both clients wrap fetch errors and keep the abort reason as the cause.
function isTimeout(error: unknown): boolean {
  return [error, error instanceof Error ? error.cause : undefined].some(
    (e) => e instanceof Error && e.name === "TimeoutError",
  );
}
