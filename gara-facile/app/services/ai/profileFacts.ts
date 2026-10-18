import { eq } from "drizzle-orm";
import { AnalyzeError } from "./analyze";
import type { CompanyFacts } from "./types";
import demoJson from "../../../fixtures/company/demo-company.json";

export interface ProfileFactsInput {
  business: { name: string; country: string; city: string };
  record: {
    id: number;
    offerings: string | null | undefined;
    cpvCodes: string[];
    certifications: string[];
    languages: string[];
  };
  documents: {
    originalName: string;
    category: string;
    expiresAt?: string | null;
  }[];
}

export function demoCompanyFacts(): CompanyFacts {
  return structuredClone(demoJson as CompanyFacts);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function toCompanyFacts(
  input: ProfileFactsInput,
  demo: CompanyFacts = demoCompanyFacts(),
): CompanyFacts {
  const offerings =
    input.record.offerings && input.record.offerings.trim()
      ? input.record.offerings
      : demo.offerings;
  const cpvCodes = input.record.cpvCodes.length
    ? [...input.record.cpvCodes]
    : [...demo.cpvCodes];
  const languages = input.record.languages.length
    ? [...input.record.languages]
    : [...demo.languages];
  const certifications = input.record.certifications.length
    ? input.record.certifications.map((name) => {
        const doc = input.documents.find((d) =>
          normalize(d.originalName).includes(normalize(name)),
        );
        return {
          name,
          ...(doc?.expiresAt ? { expiresAt: doc.expiresAt.slice(0, 10) } : {}),
          hasDocument: doc !== undefined,
        };
      })
    : demo.certifications.map((c) => ({ ...c }));
  return {
    businessRecordId: input.record.id,
    name: input.business.name,
    country: input.business.country,
    city: input.business.city,
    offerings,
    cpvCodes,
    certifications,
    languages,
    annualTurnover: demo.annualTurnover.map((t) => ({ ...t })),
    employees: demo.employees,
    isSme: demo.isSme,
    bidGuaranteeCapacityEur: demo.bidGuaranteeCapacityEur,
    maxExecutionDays: demo.maxExecutionDays,
    referenceProjects: demo.referenceProjects.map((p) => ({ ...p })),
  };
}

export async function getCompanyFacts(
  businessRecordId?: number,
): Promise<CompanyFacts> {
  if (!businessRecordId || !process.env.DB_FILE_NAME) return demoCompanyFacts();
  const { db } = await import("../../db");
  const { businessRecords, businesses } = await import("../../db/schema");
  const record = db
    .select()
    .from(businessRecords)
    .where(eq(businessRecords.id, businessRecordId))
    .get();
  if (!record) throw new AnalyzeError("Business record not found.", 404);
  const business = db
    .select()
    .from(businesses)
    .where(eq(businesses.id, record.businessId))
    .get();
  if (!business) throw new AnalyzeError("Business record not found.", 404);
  const { getDocumentService } = await import("../files/runtime");
  const documents = (await getDocumentService()).list(businessRecordId);
  return toCompanyFacts({
    business: {
      name: business.name,
      country: business.country,
      city: business.city,
    },
    record: {
      id: record.id,
      offerings: record.offerings,
      cpvCodes: record.cpvCodes,
      certifications: record.certifications,
      languages: record.languages,
    },
    documents: documents.map((d) => ({
      originalName: d.originalName,
      category: d.category,
      expiresAt: d.expiresAt,
    })),
  });
}
