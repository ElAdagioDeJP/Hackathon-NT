// Server-only: uploads company knowledge to the Evolus library (EVOLUS_LIBRARY_ID).
import { createHash } from "node:crypto";
import { EvolusApiError } from "../match/evolus";
import type { CompanyFacts } from "./types";
import { evolusRequest, type EvolusDeps } from "./evolus";

// From GET /memories/document-formats; other files are skipped, not sent.
const SUPPORTED = new Set(["txt", "md", "csv", "json", "xml", "html", "htm", "pdf", "docx"]);

export interface LibraryFile {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

export interface LibrarySyncResult {
  libraryId: string;
  uploaded: { title: string; documentId: string }[];
  skipped: { title: string; reason: "unchanged" | "unsupported" }[];
}

/** Italian plain-text company sheet, so the agent can cite it. */
export function companyFactsText(facts: CompanyFacts): string {
  const lines = [
    `Scheda aziendale: ${facts.name}`,
    `Sede: ${facts.city}, ${facts.country}`,
    `Attività: ${facts.offerings}`,
    `Codici CPV: ${facts.cpvCodes.join(", ") || "nessuno"}`,
    `Lingue: ${facts.languages.join(", ")}`,
    "Certificazioni:",
    ...facts.certifications.map(
      (c) =>
        `- ${c.name}${c.expiresAt ? `, valida fino al ${c.expiresAt}` : ""}${c.hasDocument ? ", documento caricato" : ", senza documento"}`,
    ),
    "Fatturato annuo:",
    ...facts.annualTurnover.map((t) => `- ${t.year}: ${t.amountEur} EUR`),
  ];
  if (facts.employees !== undefined) lines.push(`Dipendenti: ${facts.employees}`);
  if (facts.isSme !== undefined) lines.push(`PMI: ${facts.isSme ? "sì" : "no"}`);
  if (facts.bidGuaranteeCapacityEur !== undefined)
    lines.push(`Capacità di garanzia: ${facts.bidGuaranteeCapacityEur} EUR`);
  if (facts.maxExecutionDays !== undefined)
    lines.push(`Tempo massimo di esecuzione: ${facts.maxExecutionDays} giorni`);
  lines.push(
    "Progetti di riferimento:",
    ...facts.referenceProjects.map(
      (p) =>
        `- ${p.name} (${p.client}, ${p.year}, ${p.valueEur} EUR, ${p.isPublic ? "pubblico" : "privato"})`,
    ),
  );
  return lines.join("\n") + "\n";
}

/**
 * Uploads files whose content hash is not already in the library.
 * The hash goes into the document title, so the library itself is the dedup store.
 * Stops at the first Evolus error (uploads cost credits; no retries).
 */
export async function syncLibrary(
  files: LibraryFile[],
  language: string,
  deps: EvolusDeps = {},
): Promise<LibrarySyncResult> {
  const libraryId = (deps.env ?? process.env).EVOLUS_LIBRARY_ID?.trim();
  if (!libraryId)
    throw new EvolusApiError("Evolus library is not configured. Missing EVOLUS_LIBRARY_ID.");
  const base = `/memories/${encodeURIComponent(libraryId)}/documents`;

  const existing = (await evolusRequest(base, {}, deps)) as { title?: string | null }[];
  const titles = existing.map((d) => d.title ?? "");
  const result: LibrarySyncResult = { libraryId, uploaded: [], skipped: [] };

  for (const file of files) {
    const dot = file.name.lastIndexOf(".");
    const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
    const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
    const hash = createHash("sha256").update(file.bytes).digest("hex").slice(0, 12);
    const title = `${stem}-${hash}.${ext}`;
    if (!SUPPORTED.has(ext)) {
      result.skipped.push({ title: file.name, reason: "unsupported" });
      continue;
    }
    if (titles.some((t) => t.includes(hash))) {
      result.skipped.push({ title, reason: "unchanged" });
      continue;
    }
    const form = new FormData();
    form.append("file", new Blob([file.bytes], { type: file.mimeType }), title);
    const doc = (await evolusRequest(
      `${base}?language=${encodeURIComponent(language)}`,
      { method: "POST", body: form },
      deps,
    )) as { id: string };
    result.uploaded.push({ title, documentId: doc.id });
  }
  return result;
}
