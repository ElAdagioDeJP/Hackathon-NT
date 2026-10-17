"use server";

import { cookies } from "next/headers";
import { PROFILE_COOKIE } from "../services/business/profiles";
import { MatchError } from "../services/match/find-matches";
import { getMatchService } from "../services/match/runtime";
import type { StoredMatch } from "../services/match/types";

export async function listStoredMatches(): Promise<
  { matches: StoredMatch[] } | { error: string }
> {
  try {
    const jar = await cookies();
    const service = await getMatchService();
    return { matches: service.list(jar.get(PROFILE_COOKIE)?.value) };
  } catch (error) {
    console.error("Could not list matches", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "Could not load saved matches." };
  }
}

export async function findMatchesAction(): Promise<
  { matches: StoredMatch[] } | { error: string }
> {
  try {
    const jar = await cookies();
    const service = await getMatchService();
    const matches = await service.findMatches(jar.get(PROFILE_COOKIE)?.value);
    return { matches };
  } catch (error) {
    if (error instanceof MatchError) return { error: error.message };
    console.error("Could not find matches", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      error: "Matching could not be completed. Please try again.",
    };
  }
}
