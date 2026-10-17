// Stand-in for ai/profileFacts.ts demo company until it lands.
// Same CompanyFacts shape; replace the import in app/api/ai/analyze/route.ts.
import type { CompanyFacts } from "../types";

export const DEMO_COMPANY: CompanyFacts = {
  businessRecordId: 0,
  name: "Nuvola Software S.r.l.",
  country: "ITA",
  city: "Milano",
  offerings: "Custom software development, cloud migration and maintenance for public administrations.",
  cpvCodes: ["72000000", "72200000", "72260000"],
  certifications: [
    { name: "ISO 9001", expiresAt: "2028-03-31", hasDocument: true },
    { name: "ISO/IEC 27001", expiresAt: "2027-09-30", hasDocument: true },
  ],
  languages: ["it", "en"],
  annualTurnover: [
    { year: 2023, amountEur: 1_150_000 },
    { year: 2024, amountEur: 1_320_000 },
    { year: 2025, amountEur: 1_480_000 },
  ],
  employees: 18,
  isSme: true,
  bidGuaranteeCapacityEur: 40_000,
  maxExecutionDays: 45,
  referenceProjects: [
    { name: "Portale servizi online", client: "Comune di Bergamo", year: 2024, valueEur: 310_000, isPublic: true },
    { name: "Migrazione cloud gestionale", client: "ASST Lodi", year: 2025, valueEur: 420_000, isPublic: true },
    { name: "App prenotazioni", client: "Private client", year: 2023, valueEur: 95_000, isPublic: false },
  ],
};
