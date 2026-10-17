import {
  COUNTRY_OPTIONS,
  EMPTY_PROFILE,
  type BusinessProfileDraft,
  type ProfileErrors,
} from "./types";

const countries = new Set<string>(COUNTRY_OPTIONS.map(([code]) => code));
export function parseProfile(input: unknown, complete: boolean) {
  const errors: ProfileErrors = {};
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const profile = { ...EMPTY_PROFILE };
  const limits = {
    name: 160,
    country: 3,
    city: 120,
    offerings: 2000,
    capacity: 2000,
    experience: 3000,
  } as const;
  for (const [field, max] of Object.entries(limits) as [
    keyof typeof limits,
    number,
  ][]) {
    const value = source[field];
    if (typeof value !== "string" || value.length > max)
      errors[field] = `Enter text with no more than ${max} characters.`;
    else profile[field] = value.trim();
  }
  if (!profile.name) errors.name = "Enter your company name.";
  if (!countries.has(profile.country))
    errors.country = "Select your company's country.";
  if (!profile.city) errors.city = "Enter your company's city.";
  if (!profile.offerings)
    errors.offerings = "Tell us which services or products you offer.";
  if (
    ["", "local", "national", "international"].includes(
      String(source.coverageScope),
    )
  )
    profile.coverageScope =
      source.coverageScope as BusinessProfileDraft["coverageScope"];
  else errors.coverageScope = "Choose a valid coverage area.";
  if (
    !Array.isArray(source.coverageCountries) ||
    source.coverageCountries.length > 27 ||
    source.coverageCountries.some(
      (code) => typeof code !== "string" || !countries.has(code),
    )
  )
    errors.coverageCountries = "Select valid EU countries.";
  else
    profile.coverageCountries = [
      ...new Set(source.coverageCountries as string[]),
    ];
  if (
    source.experienceLevel === "starting" ||
    source.experienceLevel === "experienced"
  )
    profile.experienceLevel = source.experienceLevel;
  else errors.experience = "Choose your experience level.";
  if (profile.experienceLevel === "starting") profile.experience = "";
  if (profile.coverageScope !== "international") profile.coverageCountries = [];
  if (complete) {
    if (!profile.coverageScope)
      errors.coverageScope = "Choose where you can work.";
    if (
      profile.coverageScope === "international" &&
      !profile.coverageCountries.length
    )
      errors.coverageCountries =
        "Select at least one country where you can work.";
    if (!profile.capacity)
      errors.capacity = "Describe the projects you can take on.";
    if (profile.experienceLevel === "experienced" && !profile.experience)
      errors.experience =
        "Add an example or select that you are just starting out.";
  }
  return { profile, errors };
}
