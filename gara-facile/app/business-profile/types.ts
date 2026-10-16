export type CoverageScope = "local" | "national" | "international";
export type ExperienceLevel = "experienced" | "starting";

/** Shared shape for the onboarding UI and the future business service. */
export interface BusinessProfileDraft {
  name: string;
  country: string;
  city: string;
  offerings: string;
  coverageScope: CoverageScope | "";
  coverageCountries: string[];
  capacity: string;
  experienceLevel: ExperienceLevel;
  experience: string;
}

export type ProfileErrors = Partial<Record<keyof BusinessProfileDraft, string>>;
export interface SavedProfile {
  recordId: number;
  profile: BusinessProfileDraft;
  status: "draft" | "pending_review" | "approved";
  approvedAt: string | null;
}
export interface ProfileDocument {
  id: number;
  businessRecordId: number;
  category: "context" | "legal";
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
}

export const EMPTY_PROFILE: BusinessProfileDraft = {
  name: "",
  country: "",
  city: "",
  offerings: "",
  coverageScope: "",
  coverageCountries: [],
  capacity: "",
  experienceLevel: "experienced",
  experience: "",
};

export const COUNTRY_OPTIONS = [
  ["AUT", "Austria"],
  ["BEL", "Belgium"],
  ["BGR", "Bulgaria"],
  ["HRV", "Croatia"],
  ["CYP", "Cyprus"],
  ["CZE", "Czech Republic"],
  ["DNK", "Denmark"],
  ["EST", "Estonia"],
  ["FIN", "Finland"],
  ["FRA", "France"],
  ["DEU", "Germany"],
  ["GRC", "Greece"],
  ["HUN", "Hungary"],
  ["IRL", "Ireland"],
  ["ITA", "Italy"],
  ["LVA", "Latvia"],
  ["LTU", "Lithuania"],
  ["LUX", "Luxembourg"],
  ["MLT", "Malta"],
  ["NLD", "Netherlands"],
  ["POL", "Poland"],
  ["PRT", "Portugal"],
  ["ROU", "Romania"],
  ["SVK", "Slovakia"],
  ["SVN", "Slovenia"],
  ["ESP", "Spain"],
  ["SWE", "Sweden"],
] as const;

export function countryLabel(code: string) {
  return COUNTRY_OPTIONS.find(([value]) => value === code)?.[1] ?? code;
}
