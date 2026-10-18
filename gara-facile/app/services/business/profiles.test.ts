import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { EMPTY_PROFILE } from "../../business-profile/types";
import { parseProfile } from "../../business-profile/validation";
import { businessProfileSessions } from "../../db/schema";
import { createDocumentService } from "../files/documents";
import { createDocumentApi } from "../files/http";
import { createDocumentStorage } from "../files/storage";
import { createProfileService, PROFILE_COOKIE } from "./profiles";
import { createProfileRequestAuthorizer } from "./session";

const draft = {
  ...EMPTY_PROFILE,
  name: "Example business",
  country: "ESP",
  city: "Madrid",
  offerings: "Electrical installation and maintenance.",
};
const complete = {
  ...draft,
  coverageScope: "national" as const,
  capacity: "A team of 8 technicians.",
  experienceLevel: "starting" as const,
};
function fixture() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "./drizzle" });
  return { sqlite, db, service: createProfileService(db) };
}

test("profile creation, partial draft resumption, approval and edits persist under a private session", () => {
  const f = fixture();
  try {
    const first = f.service.save(undefined, draft, false);
    assert.ok(first.newToken);
    assert.equal(f.service.get(first.newToken)?.profile.name, draft.name);
    assert.equal(f.service.get(first.newToken)?.profile.capacity, "");
    assert.notEqual(
      f.db.select().from(businessProfileSessions).get()!.tokenHash,
      first.newToken,
    );
    assert.equal(f.service.get("f".repeat(64)), null);
    assert.throws(
      () => f.service.save(first.newToken, draft, true),
      /highlighted fields/,
    );
    const approved = f.service.save(first.newToken, complete, true, true);
    assert.equal(approved.saved.status, "approved");
    assert.ok(approved.saved.approvedAt);
    assert.equal(approved.saved.recordId, first.saved.recordId);
    assert.equal(approved.newToken, undefined);
    const updated = f.service.save(
      first.newToken,
      { ...complete, city: "Valencia" },
      true,
    );
    assert.equal(updated.saved.profile.city, "Valencia");
    assert.equal(updated.saved.status, "draft");
    assert.equal(updated.saved.approvedAt, null);
    f.sqlite.exec("UPDATE business_profile_sessions SET expires_at = 1");
    assert.equal(f.service.get(first.newToken), null);
    assert.throws(
      () => f.service.save(first.newToken, complete, true),
      /expired/,
    );
  } finally {
    f.sqlite.close();
  }
});

test("server validation rejects forged types, country codes and oversized content", () => {
  assert.ok(Object.keys(parseProfile(null, true).errors).length);
  assert.ok(parseProfile({ ...complete, name: 12 }, true).errors.name);
  assert.ok(parseProfile({ ...complete, country: "ZZZ" }, true).errors.country);
  assert.ok(
    parseProfile({ ...complete, capacity: "x".repeat(2001) }, true).errors
      .capacity,
  );
  assert.ok(
    parseProfile(
      { ...complete, coverageScope: "international", coverageCountries: [] },
      true,
    ).errors.coverageCountries,
  );
  assert.ok(
    parseProfile({ ...complete, coverageCountries: ["ZZZ"] }, true).errors
      .coverageCountries,
  );
  assert.deepEqual(
    parseProfile(
      {
        ...complete,
        coverageScope: "international",
        coverageCountries: ["ESP", "ESP"],
      },
      true,
    ).profile.coverageCountries,
    ["ESP"],
  );
  assert.equal(
    parseProfile({ ...complete, experience: "Old hidden text" }, true).profile
      .experience,
    "",
  );
});

test("browser files require the owning session and same-origin mutations, without an operator token", async () => {
  const f = fixture();
  const directory = await mkdtemp(join(tmpdir(), "gara-profile-test-"));
  try {
    const owner = f.service.save(undefined, complete, true, true);
    const other = f.service.save(undefined, complete, true);
    const storage = createDocumentStorage({
      provider: "local",
      localDirectory: directory,
    });
    const files = createDocumentService(f.db, storage);
    const api = createDocumentApi({
      getService: () => files,
      getToken: () => undefined,
      authorizeSession: createProfileRequestAuthorizer(() => f.service),
    });
    const url = "http://localhost/api/documents";
    const headers = {
      Cookie: `${PROFILE_COOKIE}=${owner.newToken}`,
      Origin: "http://localhost",
    };
    await createProfileRequestAuthorizer(() => f.service)(
      new Request("http://0.0.0.0/api/documents", {
        method: "DELETE",
        headers: { ...headers, Host: "localhost" },
      }),
      owner.saved.recordId,
    );
    assert.equal(
      (await api.list(new Request(url), String(owner.saved.recordId))).status,
      401,
    );
    assert.equal(
      (
        await api.list(
          new Request(url, { headers }),
          String(other.saved.recordId),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await api.list(
          new Request(url, { headers }),
          String(owner.saved.recordId),
        )
      ).status,
      200,
    );
    const form = new FormData();
    form.set("category", "context");
    form.set("file", new File(["%PDF-1.4\n%%EOF\n"], "portfolio.pdf"));
    assert.equal(
      (
        await api.upload(
          new Request(url, {
            method: "POST",
            headers: { ...headers, Origin: "http://other-site.example" },
            body: form,
          }),
          String(owner.saved.recordId),
        )
      ).status,
      403,
    );
    const uploaded = await api.upload(
      new Request(url, { method: "POST", headers, body: form }),
      String(owner.saved.recordId),
    );
    assert.equal(uploaded.status, 201);
    const { document } = await uploaded.json();
    assert.equal(f.service.get(owner.newToken)?.status, "draft");
    f.service.save(owner.newToken, complete, true, true);
    assert.equal(
      (
        await api.remove(
          new Request(url, { method: "DELETE", headers }),
          String(owner.saved.recordId),
          String(document.id),
        )
      ).status,
      204,
    );
    assert.equal(f.service.get(owner.newToken)?.status, "draft");
  } finally {
    f.sqlite.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("editing a matched profile clears its stale ledger; submissions freeze it", async () => {
  const f = fixture();
  const directory = await mkdtemp(join(tmpdir(), "gara-profile-test-"));
  try {
    const owner = f.service.save(undefined, complete, true, true);
    const id = owner.saved.recordId;
    const matches = () =>
      (f.sqlite.prepare("SELECT count(*) AS c FROM contract_matches").get() as { c: number }).c;
    const match = () =>
      f.sqlite.exec(
        `INSERT OR IGNORE INTO contracts (id, title, url) VALUES ('TED-1', 'Test', 'https://example.test'); INSERT INTO contract_matches (contract_id, business_record_id) VALUES ('TED-1', ${id});`,
      );
    match();
    const edited = f.service.save(owner.newToken, { ...complete, city: "Valencia" }, true);
    assert.equal(edited.saved.profile.city, "Valencia");
    assert.equal(edited.saved.status, "draft");
    assert.equal(matches(), 0);

    const files = createDocumentService(
      f.db,
      createDocumentStorage({ provider: "local", localDirectory: directory }),
    );
    match();
    const pdf = () => new File(["%PDF-1.4\n%%EOF\n"], "portfolio.pdf");
    const doc = await files.upload(id, pdf(), "context");
    assert.equal(matches(), 0);
    match();
    await files.remove(id, doc.id);
    assert.equal(matches(), 0);

    match();
    f.sqlite.exec("INSERT INTO submissions (contract_match_id, content) SELECT id, X'01' FROM contract_matches");
    assert.throws(
      () => f.service.save(owner.newToken, { ...complete, city: "Bilbao" }, true),
      /submissions/,
    );
    assert.equal(f.service.get(owner.newToken)?.profile.city, "Valencia");
    await assert.rejects(() => files.upload(id, pdf(), "context"), /submissions/);
    assert.equal(matches(), 1);
  } finally {
    f.sqlite.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("saving an open profile after its session expired never creates another company", () => {
  const f = fixture();
  try {
    const owner = f.service.save(undefined, complete, true);
    const other = f.service.save(undefined, complete, true);
    const recordId = owner.saved.recordId;
    const companies = () =>
      f.sqlite.prepare("SELECT count(*) AS c FROM businesses").get() as { c: number };
    assert.throws(
      () => f.service.save(other.newToken, complete, true, false, recordId),
      /expired/,
    );
    f.sqlite.exec("UPDATE business_profile_sessions SET expires_at = 1");
    for (const token of [owner.newToken, undefined])
      assert.throws(
        () => f.service.save(token, { ...complete, city: "Valencia" }, true, false, recordId),
        /expired/,
      );
    assert.equal(companies().c, 2);
    // A browser that opened a fresh form may still start a new profile.
    assert.ok(f.service.save(undefined, complete, true).newToken);
  } finally {
    f.sqlite.close();
  }
});
