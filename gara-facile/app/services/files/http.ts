import { createHash, timingSafeEqual } from "node:crypto";
import { MAX_FILE_BYTES, type DocumentService } from "./documents";
import { FileApiError } from "./errors";

const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 64 * 1024;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function parseId(value: string) {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id))
    throw new FileApiError(400, "INVALID_ID", "IDs must be positive integers.");
  return id;
}

async function readForm(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("multipart/form-data;")
  )
    throw new FileApiError(
      415,
      "MULTIPART_REQUIRED",
      "Send the file using multipart/form-data.",
    );
  const length = request.headers.get("content-length");
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > MAX_MULTIPART_BYTES)
  )
    throw new FileApiError(
      413,
      "REQUEST_TOO_LARGE",
      "The upload request exceeds the size limit.",
    );
  if (!request.body)
    throw new FileApiError(
      400,
      "EMPTY_REQUEST",
      "The upload request is empty.",
    );
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.length;
      if (total > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new FileApiError(
          413,
          "REQUEST_TOO_LARGE",
          "The upload request exceeds the size limit.",
        );
      }
      chunks.push(chunk.value);
    }
    // Parsing happens only after enforcing the byte cap, even without Content-Length.
    const body = new Uint8Array(Buffer.concat(chunks, total));
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    if (
      [...form.keys()].some(
        (key) => !["file", "category", "expiresAt"].includes(key),
      ) ||
      form.getAll("file").length !== 1 ||
      form.getAll("category").length !== 1 ||
      form.getAll("expiresAt").length > 1
    ) {
      throw new FileApiError(
        400,
        "INVALID_FORM",
        "Send one file, one category and an optional expiry date.",
      );
    }
    const file = form.get("file");
    const category = form.get("category");
    const expiresAt = form.get("expiresAt");
    if (
      !(file instanceof File) ||
      typeof category !== "string" ||
      (expiresAt !== null && typeof expiresAt !== "string")
    )
      throw new FileApiError(
        400,
        "INVALID_FORM",
        "Send one file, one category and an optional expiry date.",
      );
    return { file, category, expiresAt: expiresAt ?? undefined };
  } catch (error) {
    if (error instanceof FileApiError) throw error;
    throw new FileApiError(
      400,
      "INVALID_MULTIPART",
      "The upload request could not be read.",
    );
  } finally {
    reader.releaseLock();
  }
}

export function createDocumentApi(options: {
  getService: () => DocumentService | Promise<DocumentService>;
  getToken: () => string | undefined;
  authorizeSession?: (request: Request, recordId: number) => Promise<void>;
}) {
  async function handle(
    request: Request,
    recordId: string,
    operation: () => Promise<Response>,
  ) {
    try {
      const authorization = request.headers.get("authorization");
      if (!authorization && options.authorizeSession) {
        await options.authorizeSession(request, parseId(recordId));
      } else {
        const token = options.getToken();
        if (!token || token.length < 32)
          throw new FileApiError(
            503,
            "FILES_AUTH_NOT_CONFIGURED",
            "The file API is not configured.",
          );
        const supplied = authorization?.startsWith("Bearer ")
          ? authorization.slice(7)
          : "";
        const digest = (value: string) =>
          createHash("sha256").update(value).digest();
        if (!supplied || !timingSafeEqual(digest(supplied), digest(token)))
          throw new FileApiError(
            401,
            "UNAUTHORIZED",
            "A valid file API bearer token is required.",
          );
      }
      return await operation();
    } catch (error) {
      const expected = error instanceof FileApiError;
      if (!expected)
        console.error("Document API operation failed", {
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
      return Response.json(
        {
          error: {
            code: expected ? error.code : "FILE_OPERATION_FAILED",
            message: expected
              ? error.message
              : "The file operation failed. Please try again.",
          },
        },
        {
          status: expected ? error.status : 500,
          headers: {
            ...PRIVATE_HEADERS,
            ...(expected && error.status === 401
              ? { "WWW-Authenticate": "Bearer" }
              : {}),
          },
        },
      );
    }
  }
  return {
    list(request: Request, recordId: string) {
      return handle(request, recordId, async () => {
        const id = parseId(recordId);
        const service = await options.getService();
        return Response.json(
          { documents: service.list(id) },
          { headers: PRIVATE_HEADERS },
        );
      });
    },
    upload(request: Request, recordId: string) {
      return handle(request, recordId, async () => {
        const id = parseId(recordId);
        const { file, category, expiresAt } = await readForm(request);
        const service = await options.getService();
        const document = await service.upload(id, file, category, expiresAt);
        return Response.json(
          { document },
          {
            status: 201,
            headers: { ...PRIVATE_HEADERS, Location: document.downloadUrl },
          },
        );
      });
    },
    download(request: Request, recordId: string, documentId: string) {
      return handle(request, recordId, async () => {
        const parent = parseId(recordId),
          id = parseId(documentId);
        const service = await options.getService();
        const file = await service.download(parent, id);
        const fallback = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_");
        const encoded = encodeURIComponent(file.name).replace(
          /['()*]/g,
          (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
        );
        return new Response(file.body, {
          headers: {
            ...PRIVATE_HEADERS,
            "Content-Type": file.mimeType,
            "Content-Length": String(file.size),
            "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
            "Content-Security-Policy": "sandbox; default-src 'none'",
          },
        });
      });
    },
    remove(request: Request, recordId: string, documentId: string) {
      return handle(request, recordId, async () => {
        const parent = parseId(recordId),
          id = parseId(documentId);
        const service = await options.getService();
        await service.remove(parent, id);
        return new Response(null, { status: 204, headers: PRIVATE_HEADERS });
      });
    },
  };
}
