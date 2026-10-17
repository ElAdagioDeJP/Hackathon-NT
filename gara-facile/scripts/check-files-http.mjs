import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

// Exercise the compiled Next.js route handlers with isolated data on a free port.
const directory = await mkdtemp(join(tmpdir(), "gara-files-http-"));
const databasePath = join(directory, "test.db");
const sqlite = new Database(databasePath);
migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
sqlite.exec("INSERT INTO businesses (name, country, city) VALUES ('HTTP test', 'ESP', 'Madrid'); INSERT INTO business_records (business_id) VALUES (1);");
sqlite.close();

const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const token = randomBytes(32).toString("hex");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: {
    ...process.env, DB_FILE_NAME: databasePath, FILES_API_TOKEN: token,
    FILES_STORAGE_PROVIDER: "local", FILES_LOCAL_DIR: join(directory, "uploads"),
    R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_BUCKET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { output = (output + data).slice(-20000); });
const base = `http://127.0.0.1:${port}`;
const url = `${base}/api/business-records/1/documents`;
const headers = { Authorization: `Bearer ${token}` };
try {
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status === 401) { ready = true; break; }
      throw new Error(`Unexpected readiness response: ${response.status} ${await response.text()}`);
    } catch (error) {
      if (!(error instanceof TypeError) && error.name !== "TimeoutError") throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, `The production server did not become ready. ${output}`);
  const bytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
  const form = new FormData();
  form.set("file", new File([bytes], "http-test.pdf", { type: "application/pdf" }));
  form.set("category", "context");
  const uploaded = await fetch(url, { method: "POST", headers, body: form });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const { document } = await uploaded.json();
  const listed = await fetch(url, { headers });
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).documents.length, 1);
  const download = await fetch(`${base}${document.downloadUrl}`, { headers });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  assert.equal((await fetch(`${base}${document.downloadUrl}`, { method: "DELETE", headers })).status, 204);
  assert.equal((await (await fetch(url, { headers })).json()).documents.length, 0);
  console.log("PASS: compiled Next.js HTTP routes, bearer auth, upload, list, streamed download and delete");
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const timeout = setTimeout(() => server.kill("SIGKILL"), 3000);
    await exited;
    clearTimeout(timeout);
  }
  await rm(directory, { recursive: true, force: true });
}
