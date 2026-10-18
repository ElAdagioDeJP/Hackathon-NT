import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { and, count, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { fileTypeFromBuffer } from "file-type";
import { businessDocuments, businessRecords } from "../../db/schema";
import { clearStaleLedger, hasSubmissions } from "../match/store";
import { FileApiError, StoredFileNotFound } from "./errors";
import type { DocumentStorage } from "./storage";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_CATEGORY = 5;
type Category = "context" | "legal";
type DocumentRow = typeof businessDocuments.$inferSelect;

function documentInfo(row: DocumentRow) {
  return {
    id: row.id,
    businessRecordId: row.businessRecordId,
    category: row.category,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    processingStatus: row.processingStatus,
    uploadedAt: row.uploadedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    downloadUrl: `/api/business-records/${row.businessRecordId}/documents/${row.id}`,
  };
}

async function validateFile(file: File) {
  const name = file.name.normalize("NFC");
  if (
    !name ||
    Buffer.byteLength(name, "utf8") > 240 ||
    /[\x00-\x1f\x7f/\\]/.test(name)
  ) {
    throw new FileApiError(
      400,
      "INVALID_FILENAME",
      "Use a filename without paths or control characters, up to 240 bytes long.",
    );
  }
  if (!file.size)
    throw new FileApiError(400, "EMPTY_FILE", "The file is empty.");
  if (file.size > MAX_FILE_BYTES)
    throw new FileApiError(
      413,
      "FILE_TOO_LARGE",
      "Files must not exceed 10 MB.",
    );
  const extension = extname(name).slice(1).toLowerCase();
  if (!["pdf", "doc", "docx"].includes(extension))
    throw new FileApiError(
      415,
      "UNSUPPORTED_FILE",
      "Only PDF, DOC and DOCX files are supported.",
    );
  const content = Buffer.from(await file.arrayBuffer());
  let detected;
  try {
    detected = await fileTypeFromBuffer(content);
  } catch {
    throw new FileApiError(
      415,
      "INVALID_FILE",
      "The file content could not be recognised.",
    );
  }
  // Legacy Word uses the OLE Compound File container; verify Word's stream name
  // as well, since spreadsheets and presentations share the same signature.
  const isDoc =
    extension === "doc" &&
    detected?.ext === "cfb" &&
    content.includes(Buffer.from("WordDocument", "utf16le"));
  if (detected?.ext !== extension && !isDoc)
    throw new FileApiError(
      415,
      "FILE_TYPE_MISMATCH",
      "The file content does not match its PDF, DOC or DOCX extension.",
    );
  const mimeType = extension === "doc" ? "application/msword" : detected!.mime;
  return { name, content, mimeType, extension };
}

export function createDocumentService(
  db: BetterSQLite3Database,
  storage: DocumentStorage,
) {
  function requireRecord(recordId: number) {
    if (
      !db
        .select({ id: businessRecords.id })
        .from(businessRecords)
        .where(eq(businessRecords.id, recordId))
        .get()
    ) {
      throw new FileApiError(
        404,
        "PROFILE_NOT_FOUND",
        "The business profile was not found.",
      );
    }
  }
  function find(recordId: number, documentId: number) {
    const row = db
      .select()
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.id, documentId),
          eq(businessDocuments.businessRecordId, recordId),
        ),
      )
      .get();
    if (!row)
      throw new FileApiError(
        404,
        "DOCUMENT_NOT_FOUND",
        "The document was not found.",
      );
    return row;
  }
  function requireCapacity(recordId: number, category: Category) {
    const total = db
      .select({ total: count() })
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.businessRecordId, recordId),
          eq(businessDocuments.category, category),
        ),
      )
      .get()!.total;
    if (total >= MAX_FILES_PER_CATEGORY)
      throw new FileApiError(
        409,
        "DOCUMENT_LIMIT",
        "A profile can have up to 5 files per category.",
      );
  }
  function requireEditable(
    recordId: number,
    tx: Parameters<typeof hasSubmissions>[0] = db,
  ) {
    if (hasSubmissions(tx, recordId))
      throw new FileApiError(
        409,
        "PROFILE_LOCKED",
        "This profile already has submissions drafted from its matches and its documents can no longer change.",
      );
  }
  return {
    list(recordId: number) {
      requireRecord(recordId);
      return db
        .select()
        .from(businessDocuments)
        .where(eq(businessDocuments.businessRecordId, recordId))
        .orderBy(businessDocuments.id)
        .all()
        .map(documentInfo);
    },
    async upload(
      recordId: number,
      file: File,
      category: string,
      expiresAt?: string,
    ) {
      requireRecord(recordId);
      requireEditable(recordId);
      if (category !== "context" && category !== "legal")
        throw new FileApiError(
          400,
          "INVALID_CATEGORY",
          "Category must be context or legal.",
        );
      let expiry: Date | null = null;
      if (expiresAt !== undefined) {
        expiry = new Date(`${expiresAt}T00:00:00.000Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) ||
          !Number.isFinite(expiry.getTime()) ||
          expiry.toISOString().slice(0, 10) !== expiresAt
        ) {
          throw new FileApiError(
            400,
            "INVALID_EXPIRY",
            "Expiry must be a valid date in YYYY-MM-DD format.",
          );
        }
      }
      requireCapacity(recordId, category);
      const validated = await validateFile(file);
      const key = `business-records/${recordId}/${category}/${randomUUID()}.${validated.extension}`;
      const location = await storage.put(
        key,
        validated.content,
        validated.mimeType,
      );
      try {
        return db.transaction(
          (tx) => {
            requireEditable(recordId, tx);
            clearStaleLedger(tx, recordId);
            // Recheck the quota under a SQLite write lock after the async upload.
            const total = tx
              .select({ total: count() })
              .from(businessDocuments)
              .where(
                and(
                  eq(businessDocuments.businessRecordId, recordId),
                  eq(businessDocuments.category, category),
                ),
              )
              .get()!.total;
            if (total >= MAX_FILES_PER_CATEGORY)
              throw new FileApiError(
                409,
                "DOCUMENT_LIMIT",
                "A profile can have up to 5 files per category.",
              );
            const row = tx
              .insert(businessDocuments)
              .values({
                businessRecordId: recordId,
                category,
                originalName: validated.name,
                mimeType: validated.mimeType,
                sizeBytes: validated.content.length,
                ...location,
                expiresAt: expiry,
              })
              .returning()
              .get();
            tx.update(businessRecords)
              .set({ status: "draft", approvedAt: null, updatedAt: new Date() })
              .where(eq(businessRecords.id, recordId))
              .run();
            return documentInfo(row);
          },
          { behavior: "immediate" },
        );
      } catch (error) {
        try {
          await storage.remove(location);
        } catch {
          console.error("Failed to clean up an unregistered document", {
            storageKey: location.storageKey,
          });
        }
        throw error;
      }
    },
    async download(recordId: number, documentId: number) {
      const row = find(recordId, documentId);
      try {
        const object = await storage.get(row);
        if (object.size !== row.sizeBytes) {
          await object.body.cancel();
          throw new FileApiError(
            502,
            "FILE_SIZE_MISMATCH",
            "The stored file does not match its metadata.",
          );
        }
        return { ...object, name: row.originalName, mimeType: row.mimeType };
      } catch (error) {
        if (error instanceof StoredFileNotFound)
          throw new FileApiError(
            404,
            "FILE_NOT_FOUND",
            "The stored file was not found.",
          );
        throw error;
      }
    },
    async remove(recordId: number, documentId: number) {
      const row = find(recordId, documentId);
      requireEditable(recordId);
      // Delete bytes first. On storage failure the metadata remains for retry.
      // Both storage adapters allow retrying deletion of an absent object.
      await storage.remove(row);
      db.transaction((tx) => {
        clearStaleLedger(tx, recordId);
        tx.delete(businessDocuments)
          .where(eq(businessDocuments.id, row.id))
          .run();
        tx.update(businessRecords)
          .set({ status: "draft", approvedAt: null, updatedAt: new Date() })
          .where(eq(businessRecords.id, recordId))
          .run();
      });
    },
  };
}

export type DocumentService = ReturnType<typeof createDocumentService>;
