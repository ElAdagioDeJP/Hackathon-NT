// Tender PDF → text per page. Page numbers come from the PDF itself, never the LLM.
import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import type { TenderPage } from "./types";

// Pages with less text than this are probably scans.
export const MIN_TEXT_CHARS = 40;

export const hashPdf = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

export async function parsePdf(bytes: Uint8Array): Promise<TenderPage[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((raw, i) => {
    const pageText = raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return { page: i + 1, text: pageText, needsOcr: pageText.length < MIN_TEXT_CHARS };
  });
}

// Parse once per file content; cache in tender_documents when a DB is configured.
export async function loadTenderPages(
  bytes: Uint8Array,
  meta: { tenderId: string; source: string },
): Promise<{ hash: string; pages: TenderPage[] }> {
  const hash = hashPdf(bytes);
  if (!process.env.DB_FILE_NAME) return { hash, pages: await parsePdf(bytes) };
  const [{ db }, { tenderDocuments }, { eq }] = await Promise.all([
    import("../../db"),
    import("../../db/schema"),
    import("drizzle-orm"),
  ]);
  const cached = db.select().from(tenderDocuments).where(eq(tenderDocuments.hash, hash)).get();
  if (cached) return { hash, pages: cached.pages as TenderPage[] };
  const pages = await parsePdf(bytes);
  db.insert(tenderDocuments).values({ hash, ...meta, pages }).onConflictDoNothing().run();
  return { hash, pages };
}
