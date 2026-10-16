import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

// Use the real Drizzle migrator, including its transaction and FK behavior.
// Both databases are in memory; no application data or files are touched.
const config = { migrationsFolder: "./drizzle" };
const migrations = readMigrationFiles(config);

for (const populated of [false, true]) {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  if (populated) {
    for (const statement of migrations[0].sql) sqlite.exec(statement);
    sqlite.exec(`
      INSERT INTO businesses VALUES (1, 'Existing business', 'contact@example.test', '123', 'ESP', 'Valencia');
      INSERT INTO business_records VALUES (1, 1);
      INSERT INTO contracts VALUES ('TED-1', 'Existing opportunity', 'https://example.test');
      INSERT INTO contract_matches VALUES (1, 'TED-1', 1, 'partial', 50);
      INSERT INTO submissions VALUES (1, 1, X'0102', 123);
      CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric);
    `);
    sqlite
      .prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      )
      .run(migrations[0].hash, migrations[0].folderMillis);
  }
  migrate(db, config);
  assert.deepEqual(sqlite.pragma("foreign_key_check"), []);
  assert.equal(sqlite.pragma("foreign_keys", { simple: true }), 1);

  if (populated) {
    assert.equal(
      sqlite.prepare("SELECT name FROM businesses WHERE id = 1").get().name,
      "Existing business",
    );
    assert.equal(
      sqlite
        .prepare("SELECT business_id FROM business_records WHERE id = 1")
        .get().business_id,
      1,
    );
    assert.equal(
      sqlite
        .prepare("SELECT business_record_id FROM contract_matches WHERE id = 1")
        .get().business_record_id,
      1,
    );
    assert.equal(
      sqlite.prepare("SELECT created_at FROM submissions WHERE id = 1").get()
        .created_at,
      123,
    );
    assert.equal(
      sqlite
        .prepare("SELECT count(*) AS count FROM whole_business_records")
        .get().count,
      1,
    );
  }

  const businessId = sqlite
    .prepare(
      "INSERT INTO businesses (name, country, city) VALUES ('Test', 'ESP', 'Madrid')",
    )
    .run().lastInsertRowid;
  const recordId = sqlite
    .prepare("INSERT INTO business_records (business_id) VALUES (?)")
    .run(businessId).lastInsertRowid;
  const record = sqlite
    .prepare("SELECT * FROM business_records WHERE id = ?")
    .get(recordId);
  assert.equal(record.status, "draft");
  assert.equal(record.approved_at, null);
  assert.equal(record.coverage_scope, null);
  assert.equal(record.coverage_countries, "[]");
  assert.equal(record.cpv_codes, "[]");
  assert.ok(Math.abs(record.created_at - Math.floor(Date.now() / 1000)) < 10);
  sqlite
    .prepare(
      "INSERT INTO business_documents (business_record_id, category, original_name, mime_type, size_bytes, storage_key) VALUES (?, 'context', 'portfolio.pdf', 'application/pdf', 100, 'businesses/test/portfolio.pdf')",
    )
    .run(recordId);
  assert.equal(
    sqlite.prepare("SELECT processing_status FROM business_documents").get()
      .processing_status,
    "pending",
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "SELECT storage_provider, storage_bucket FROM business_documents",
      )
      .get(),
    { storage_provider: "local", storage_bucket: null },
  );
  assert.throws(
    () =>
      sqlite
        .prepare(
          "INSERT INTO business_documents (business_record_id, category, original_name, mime_type, size_bytes, storage_key) VALUES (?, 'legal', 'other.pdf', 'application/pdf', 10, 'businesses/test/portfolio.pdf')",
        )
        .run(recordId),
    /UNIQUE/,
  );
  migrate(db, config);
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get()
      .count,
    migrations.length,
  );
  assert.deepEqual(sqlite.pragma("foreign_key_check"), []);
  sqlite.close();
  console.log(
    `PASS: ${populated ? "populated baseline with related records" : "fresh database"}, defaults, view, foreign keys and repeat migration`,
  );
}
