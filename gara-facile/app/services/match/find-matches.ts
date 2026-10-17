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

export interface FindMatchesDeps {
  searchNotices?: typeof fetchCandidateContracts;
  requestMatches?: typeof requestEvolusMatches;
}

export function createMatchService(
  db: BetterSQLite3Database,
  deps: FindMatchesDeps = {},
) {
  const profiles = createProfileService(db);
  const store = createMatchStore(db);
  const loadCandidates = deps.searchNotices ?? fetchCandidateContracts;
  const askEvolus = deps.requestMatches ?? requestEvolusMatches;

  return {
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
        candidates = await loadCandidates(business);
      } catch (error) {
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
        content = await askEvolus(business, candidates);
      } catch (error) {
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

      store.replaceLedger(saved.recordId, matches);
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
