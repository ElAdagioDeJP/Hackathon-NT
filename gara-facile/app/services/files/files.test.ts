import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { businessDocuments } from "../../db/schema";
import { createDocumentService, MAX_FILE_BYTES } from "./documents";
import { createDocumentApi } from "./http";
import {
  createDocumentStorage,
  LocalObjectStore,
  storageConfigFromEnv,
  type DocumentStorage,
} from "./storage";

const TOKEN = "test-only-document-api-token-not-a-secret";
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
);
function pdf(name = "portfolio.pdf") {
  return new File([PDF], name, { type: "application/pdf" });
}

// A minimal stored ZIP fixture, built without a document-generation dependency.
function zip(entries: [string, string][]) {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const filename = Buffer.from(name),
      data = Buffer.from(text);
    let checksum = 0xffffffff;
    for (const byte of data) {
      checksum ^= byte;
      for (let bit = 0; bit < 8; bit++)
        checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
    checksum = (checksum ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
function request(
  method = "GET",
  file?: File,
  category = "context",
  token: string | null = TOKEN,
) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body;
  if (file) {
    body = new FormData();
    body.set("file", file);
    body.set("category", category);
  }
  return new Request("http://localhost/api/documents", {
    method,
    headers,
    body,
  });
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "gara-files-test-"));
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "./drizzle" });
  sqlite.exec(
    "INSERT INTO businesses (id, name, country, city) VALUES (1, 'Test', 'ESP', 'Madrid'); INSERT INTO business_records (id, business_id) VALUES (1, 1), (2, 1);",
  );
  const storage = createDocumentStorage({
    provider: "local",
    localDirectory: directory,
  });
  const service = createDocumentService(db, storage);
  const api = createDocumentApi({
    getService: () => service,
    getToken: () => TOKEN,
  });
  return {
    directory,
    sqlite,
    db,
    storage,
    service,
    api,
    async close() {
      sqlite.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("local API uploads, lists, streams and deletes a document without exposing storage details", async () => {
  const f = await fixture();
  try {
    const response = await f.api.upload(
      request("POST", pdf("résumé.pdf")),
      "1",
    );
    assert.equal(response.status, 201);
    const { document } = await response.json();
    assert.equal(document.originalName, "résumé.pdf");
    assert.equal(document.processingStatus, "pending");
    assert.equal("storageKey" in document, false);
    assert.equal("storageBucket" in document, false);
    const row = f.db.select().from(businessDocuments).get()!;
    assert.equal(row.storageProvider, "local");
    assert.equal(row.storageBucket, null);
    assert.match(
      row.storageKey,
      /^business-records\/1\/context\/[a-f0-9-]+\.pdf$/,
    );
    assert.equal(
      (await (await f.api.list(request(), "1")).json()).documents.length,
      1,
    );
    assert.equal(
      (await f.api.download(request(), "2", String(document.id))).status,
      404,
    );
    assert.equal(
      (await f.api.remove(request("DELETE"), "2", String(document.id))).status,
      404,
    );
    const download = await f.api.download(request(), "1", String(document.id));
    assert.equal(download.headers.get("content-type"), "application/pdf");
    assert.match(
      download.headers.get("content-disposition")!,
      /filename\*=UTF-8''r%C3%A9sum%C3%A9.pdf/,
    );
    assert.equal(download.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), PDF);
    assert.equal(
      (await f.api.remove(request("DELETE"), "1", String(document.id))).status,
      204,
    );
    assert.equal(
      (await f.api.download(request(), "1", String(document.id))).status,
      404,
    );
    assert.deepEqual(f.db.select().from(businessDocuments).all(), []);
    assert.deepEqual(
      await readdir(join(f.directory, "business-records/1/context")),
      [],
    );
  } finally {
    await f.close();
  }
});

test("auth and invalid IDs are rejected before accessing storage or the database", async () => {
  let accessed = false;
  const api = createDocumentApi({
    getToken: () => TOKEN,
    getService: () => {
      accessed = true;
      throw new Error("Must not run");
    },
  });
  assert.equal(
    (await api.list(request("GET", undefined, "context", null), "1")).status,
    401,
  );
  assert.equal(
    (await api.list(request("GET", undefined, "context", "wrong"), "1")).status,
    401,
  );
  for (const id of ["0", "-1", "1.2", "01", "9007199254740992", "../1"])
    assert.equal((await api.list(request(), id)).status, 400);
  const unavailable = createDocumentApi({
    getToken: () => undefined,
    getService: () => {
      throw new Error("Must not run");
    },
  });
  assert.equal((await unavailable.list(request(), "1")).status, 503);
  assert.equal(accessed, false);
});

test("file validation rejects fake extensions, empty files, wrong categories, bad expiry and missing profiles", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.api.upload(request("POST", pdf()), "99")).status,
      404,
    );
    assert.equal(
      (await f.api.upload(request("POST", pdf(), "other"), "1")).status,
      400,
    );
    assert.equal(
      (await f.api.upload(request("POST", new File([], "empty.pdf")), "1"))
        .status,
      400,
    );
    assert.equal(
      (
        await f.api.upload(
          request(
            "POST",
            new File(["not a PDF"], "fake.pdf", { type: "application/pdf" }),
          ),
          "1",
        )
      ).status,
      415,
    );
    assert.equal(
      (await f.api.upload(request("POST", pdf("file.exe")), "1")).status,
      415,
    );
    assert.equal(
      (await f.api.upload(request("POST", pdf("..\\file.pdf")), "1")).status,
      400,
    );
    await assert.rejects(
      f.service.upload(1, pdf(), "legal", "2026-02-30"),
      /valid date/,
    );
    const valid = await f.service.upload(1, pdf(), "legal", "2027-01-01");
    assert.equal(valid.expiresAt, "2027-01-01T00:00:00.000Z");
    assert.equal(f.service.list(1).length, 1);
  } finally {
    await f.close();
  }
});

test("multipart boundaries, duplicate fields and body limits are enforced even without Content-Length", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.api.upload(request("POST"), "1")).status, 415);
    const form = new FormData();
    form.append("file", pdf());
    form.append("file", pdf());
    form.append("category", "context");
    assert.equal(
      (
        await f.api.upload(
          new Request("http://localhost", {
            method: "POST",
            headers: { Authorization: `Bearer ${TOKEN}` },
            body: form,
          }),
          "1",
        )
      ).status,
      400,
    );
    const malformed = new Request("http://localhost", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "multipart/form-data; boundary=x",
      },
      body: "malformed",
    });
    assert.equal((await f.api.upload(malformed, "1")).status, 400);
    const oversized = new File(
      [new Uint8Array(MAX_FILE_BYTES + 1)],
      "large.pdf",
    );
    assert.equal(
      (await f.api.upload(request("POST", oversized), "1")).status,
      413,
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_FILE_BYTES + 65537));
        controller.close();
      },
    });
    const chunked = new Request("http://localhost", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "multipart/form-data; boundary=x",
      },
      body: stream,
      duplex: "half",
    } as RequestInit);
    assert.equal((await f.api.upload(chunked, "1")).status, 413);
    assert.equal(f.service.list(1).length, 0);
  } finally {
    await f.close();
  }
});

test("Word container signatures are recognised independently of the client MIME header", async () => {
  const f = await fixture();
  try {
    const mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const docx = zip([
      [
        "[Content_Types].xml",
        `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="${mime}.main+xml"/></Types>`,
      ],
      [
        "word/document.xml",
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
      ],
    ]);
    const modern = await f.service.upload(
      1,
      new File([docx], "portfolio.docx", { type: "text/plain" }),
      "context",
    );
    assert.equal(modern.mimeType, mime);
    const legacy = Buffer.alloc(512);
    Buffer.from("d0cf11e0a1b11ae1", "hex").copy(legacy);
    Buffer.from("WordDocument", "utf16le").copy(legacy, 128);
    assert.equal(
      (
        await f.service.upload(
          1,
          new File([legacy], "portfolio.doc"),
          "context",
        )
      ).mimeType,
      "application/msword",
    );
    await assert.rejects(
      f.service.upload(
        1,
        new File(
          [Buffer.from("d0cf11e0a1b11ae1", "hex"), Buffer.alloc(504)],
          "spreadsheet.doc",
        ),
        "context",
      ),
      /does not match/,
    );
  } finally {
    await f.close();
  }
});

test("parallel uploads cannot exceed the per-category quota and rejected uploads are cleaned up", async () => {
  const f = await fixture();
  try {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        f.api.upload(request("POST", pdf()), "1"),
      ),
    );
    assert.equal(results.filter((result) => result.status === 201).length, 5);
    assert.equal(results.filter((result) => result.status === 409).length, 3);
    assert.equal(f.service.list(1).length, 5);
    assert.equal(
      (await readdir(join(f.directory, "business-records/1/context"))).length,
      5,
    );
    assert.equal(
      (await f.api.upload(request("POST", pdf(), "legal"), "1")).status,
      201,
    );
  } finally {
    await f.close();
  }
});

test("database failure after upload cleans up bytes, and failed deletes retain retryable metadata", async () => {
  const f = await fixture();
  try {
    f.sqlite.exec(
      "CREATE TRIGGER reject_document BEFORE INSERT ON business_documents BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    );
    await assert.rejects(f.service.upload(1, pdf(), "context"));
    assert.deepEqual(
      await readdir(join(f.directory, "business-records/1/context")),
      [],
    );
    f.sqlite.exec("DROP TRIGGER reject_document;");
    const document = await f.service.upload(1, pdf(), "context");
    const broken: DocumentStorage = {
      ...f.storage,
      remove: async () => {
        throw new Error("Unavailable");
      },
    };
    await assert.rejects(
      createDocumentService(f.db, broken).remove(1, document.id),
      /Unavailable/,
    );
    assert.equal(f.service.list(1).length, 1);
    const row = f.db.select().from(businessDocuments).get()!;
    await f.storage.remove(row);
    assert.equal(
      (await f.api.download(request(), "1", String(document.id))).status,
      404,
    );
    await f.service.remove(1, document.id);
    assert.equal(f.service.list(1).length, 0);
  } finally {
    await f.close();
  }
});

test("local storage blocks path traversal, symlink escapes and accidental overwrites", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gara-local-test-"));
  const outside = await mkdtemp(join(tmpdir(), "gara-outside-test-"));
  const storage = new LocalObjectStore(directory);
  try {
    for (const key of [
      "../escape",
      "/absolute",
      "folder/../escape",
      "folder\\escape",
      "folder//empty",
    ])
      await assert.rejects(storage.put(key, PDF));
    await symlink(outside, join(directory, "linked"));
    await assert.rejects(storage.put("linked/nested/file.pdf", PDF));
    assert.deepEqual(await readdir(outside), []);
    await storage.put("safe/file.pdf", PDF);
    await assert.rejects(
      storage.put("safe/file.pdf", Buffer.from("replacement")),
    );
    assert.deepEqual(
      Buffer.from(
        await new Response(
          (await storage.get("safe/file.pdf")).body,
        ).arrayBuffer(),
      ),
      PDF,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("S3 adapter uses the real SDK against a local S3-compatible HTTP fixture and preserves old locations", async () => {
  const objects = new Map<string, Buffer>();
  const requests: { method: string; path: string; authorization: string }[] =
    [];
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    requests.push({
      method: req.method!,
      path,
      authorization: req.headers.authorization ?? "",
    });
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      objects.set(path, Buffer.concat(chunks));
      res.writeHead(200, { ETag: '"test"' });
      res.end();
    } else if (req.method === "GET" && objects.has(path)) {
      const body = objects.get(path)!;
      res.writeHead(200, {
        "Content-Length": body.length,
        "Content-Type": "application/pdf",
      });
      res.end(body);
    } else if (req.method === "DELETE") {
      objects.delete(path);
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(404, { "Content-Type": "application/xml" });
      res.end("<Error><Code>NoSuchKey</Code></Error>");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const f = await fixture();
  const address = server.address() as { port: number };
  const s3 = {
    region: "us-east-1",
    endpoint: `http://127.0.0.1:${address.port}`,
    forcePathStyle: true,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED" as const,
    responseChecksumValidation: "WHEN_REQUIRED" as const,
  };
  try {
    const storage = createDocumentStorage({
      provider: "s3",
      localDirectory: f.directory,
      s3Bucket: "old-bucket",
      s3,
    });
    const service = createDocumentService(f.db, storage);
    const document = await service.upload(1, pdf(), "context");
    assert.equal(
      f.db.select().from(businessDocuments).get()!.storageBucket,
      "old-bucket",
    );
    const switched = createDocumentService(
      f.db,
      createDocumentStorage({
        provider: "local",
        localDirectory: f.directory,
        s3Bucket: "new-bucket",
        s3,
      }),
    );
    assert.deepEqual(
      Buffer.from(
        await new Response(
          (await switched.download(1, document.id)).body,
        ).arrayBuffer(),
      ),
      PDF,
    );
    const local = await switched.upload(1, pdf(), "legal");
    assert.equal(f.service.list(1).length, 2);
    await switched.remove(1, document.id);
    assert.equal(objects.size, 0);
    assert.deepEqual(
      Buffer.from(
        await new Response(
          (await switched.download(1, local.id)).body,
        ).arrayBuffer(),
      ),
      PDF,
    );
    assert.ok(
      requests.every(
        (req) =>
          req.path.startsWith("/old-bucket/") &&
          req.authorization.startsWith("AWS4-HMAC-SHA256 "),
      ),
    );
    assert.deepEqual(
      requests.map((req) => req.method),
      ["PUT", "GET", "DELETE"],
    );
  } finally {
    await f.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("configuration rejects unknown providers, public directories and incomplete S3 settings", () => {
  assert.equal(storageConfigFromEnv({}).provider, "local");
  assert.throws(() =>
    storageConfigFromEnv({ FILES_STORAGE_PROVIDER: "unknown" }),
  );
  assert.throws(() =>
    storageConfigFromEnv({ FILES_LOCAL_DIR: "./public/uploads" }),
  );
  assert.throws(() => storageConfigFromEnv({ FILES_STORAGE_PROVIDER: "s3" }));
  assert.throws(() =>
    storageConfigFromEnv({ FILES_S3_ACCESS_KEY_ID: "only-one" }),
  );
  assert.throws(() =>
    storageConfigFromEnv({ FILES_S3_ENDPOINT: "file:///tmp" }),
  );
});
