import type {
  BusinessProfileDraft,
  CoverageScope,
  ExperienceLevel,
} from "../../business-profile/types";

export type MatchType = "exact" | "partial" | "none";

/** Approved profile fields sent to the Matching agent. */
export interface BusinessModel {
  name: string;
  country: string;
  city: string;
  offerings: string;
  coverageScope: CoverageScope;
  coverageCountries: string[];
  capacity: string;
  experienceLevel: ExperienceLevel;
  experience: string;
}

/** Normalized TED notice used for Matching and persistence. */
export interface ContractModel {
  id: string;
  title: string;
  url: string;
  description: string;
  placeCountries: string[];
  cpvCodes: string[];
  deadline: string | null;
  buyerName: string | null;
}

export interface MatchModel {
  contractId: string;
  businessRecordId: number;
  type: MatchType;
  score: number;
  rationale: string;
}

export interface StoredMatch extends MatchModel {
  id: number;
  title: string;
  url: string;
  deadline: string | null;
  buyerName: string | null;
  matchedAt: string | null;
}

export function toBusinessModel(profile: BusinessProfileDraft): BusinessModel {
  if (
    profile.coverageScope !== "local" &&
    profile.coverageScope !== "national" &&
    profile.coverageScope !== "international"
  ) {
    throw new Error("Coverage scope is required for Matching.");
  }
  return {
    name: profile.name,
    country: profile.country,
    city: profile.city,
    offerings: profile.offerings,
    coverageScope: profile.coverageScope,
    coverageCountries: profile.coverageCountries,
    capacity: profile.capacity,
    experienceLevel: profile.experienceLevel,
    experience: profile.experience,
  };
}
