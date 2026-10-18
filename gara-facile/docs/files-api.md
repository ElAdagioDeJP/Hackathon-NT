# Files API

Documents belong to an existing `business_records` row. The onboarding form creates and saves that profile through Server Actions, then calls this API to upload, download and delete its documents.

Requires Node.js 22 or newer. Files are stored outside SQLite; their metadata stays in `business_documents`.

## Setup

Copy `.env.example` to `.env` and configure `DB_FILE_NAME`. The browser form uses a private session cookie and needs no operator token. For optional operator/server-to-server access, set `FILES_API_TOKEN` to a random secret of at least 32 characters, generated with `openssl rand -hex 32`. Restart the application after changing storage settings.

Only the schema is versioned; generated migrations and snapshots are ignored. For a new checkout and database, run `bun run db:generate`, then `bun run db:migrate`. Generate local migrations before running database, profile or file tests. For an existing database, retain its local migration history and review generated changes before applying them. For a database originally created with `drizzle-kit push`, establish its migration baseline before running migrations. Migrations are not applied automatically by an API request.

The browser sends a `gara_profile_session` HttpOnly cookie. Its opaque random value is stored only as a SHA-256 digest in `business_profile_sessions`, with a 30-day expiry. The API checks that the session owns the requested profile. Cookie-authenticated POST and DELETE requests must have an Origin matching the public request host and protocol. Sessions grant access to one profile and do not provide account login or recovery from another device.

Alternatively, callers can send `Authorization: Bearer <FILES_API_TOKEN>`. This operator credential has access to all profiles. Keep it on the server, never in `NEXT_PUBLIC_*`, browser code, query strings or a public repository. Operator requests fail with `503` if the configured token is missing/short and `401` if the supplied token is incorrect. An explicit Authorization header never falls back to cookie authorization. Requests without either form of access are rejected.

The form saves drafts on navigation or “Save draft”, resumes from the server after reload, and records self-approval on “Confirm profile”. Changes to profile data or documents reset approval. Profiles already used by matching reject edits until a new-version workflow is implemented. No AI analysis or matching is started by confirmation.

## Storage configuration

For local disk:

```dotenv
FILES_STORAGE_PROVIDER=local
FILES_LOCAL_DIR=./var/uploads
```

Relative paths resolve from the app's working directory. The default directory is ignored by Git and is outside `public`. Use a persistent volume when deploying in a container. The server creates the directory on the first upload and needs read/write access. Keep it private and exclude it from static hosting and backups intended for public distribution.

For Cloudflare R2:

```dotenv
FILES_STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET=garefacile
```

The endpoint is derived from the account ID (`https://<account>.r2.cloudflarestorage.com`, region `auto`, path style). The bucket must already exist. The application performs object operations only and does not create buckets or change bucket permissions. Use an R2 API token scoped to this bucket with object read and write. Keep the bucket private: documents are served through the API below, never from a public r2.dev URL. Optional checksum negotiation is disabled for compatibility; downloads still verify the stored length against metadata.

New uploads use `FILES_STORAGE_PROVIDER`. Each document records its provider and bucket, so old R2 objects remain readable when new uploads switch to local or another bucket. Keep the old bucket accessible with the same R2 credentials. Changing the bucket or local root does not move old bytes. Use a separate data migration to relocate existing files. Additional providers can implement the same `DocumentStorage` interface.

## Endpoints

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/business-records/:recordId/documents` | List document metadata |
| POST | `/api/business-records/:recordId/documents` | Upload one document, return `201` |
| GET | `/api/business-records/:recordId/documents/:documentId` | Stream a download |
| DELETE | `/api/business-records/:recordId/documents/:documentId` | Delete bytes and metadata, return `204` |

`recordId` is a business profile record ID, not a business ID. IDs must be positive integers. A document cannot be downloaded or deleted through a different profile's URL.

Upload one `multipart/form-data` request per file:

- `file`: one PDF, DOC or DOCX, nonempty, at most 10 MiB.
- `category`: `context` or `legal`.
- `expiresAt`: optional date in `YYYY-MM-DD` format. Past dates are allowed, since a document may already be expired. Uploading does not certify legal validity.

There can be at most five documents per category per profile. The quota is rechecked in a SQLite write transaction after storage completes, preventing concurrent requests from exceeding it. Unknown fields, duplicate fields, filenames containing paths/control characters, and mismatched extensions are rejected. The full request is capped at 10 MiB plus 64 KiB of multipart overhead, including requests without `Content-Length`.

The server detects binary signatures rather than trusting the browser MIME header. Legacy DOC additionally requires a Word stream marker in its OLE container. These are format checks, not full document validation or malware scanning. Files are not parsed for business information or passed to an LLM here.

Configure any reverse proxy or hosting upload limit to permit this request size. A platform can impose a lower limit before the request reaches Next.js.

Example, with the API token already exported in your shell and profile `1` already present:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $FILES_API_TOKEN" \
  -F 'category=context' \
  -F 'file=@./portfolio.pdf' \
  http://localhost:3000/api/business-records/1/documents

curl --fail-with-body \
  -H "Authorization: Bearer $FILES_API_TOKEN" \
  http://localhost:3000/api/business-records/1/documents

curl --fail-with-body \
  -H "Authorization: Bearer $FILES_API_TOKEN" \
  --output portfolio-downloaded.pdf \
  http://localhost:3000/api/business-records/1/documents/1

curl --fail-with-body -X DELETE \
  -H "Authorization: Bearer $FILES_API_TOKEN" \
  http://localhost:3000/api/business-records/1/documents/1
```

Uploads return `{ "document": ... }`; lists return `{ "documents": [...] }`. Document metadata includes ID, profile ID, category, original filename, detected MIME type, byte size, processing status, ISO timestamps and `downloadUrl`. Storage paths, keys, buckets and extracted text are not returned. `downloadUrl` requires the owning browser's session cookie or the operator bearer header. Downloads use attachment disposition, `nosniff` and `private, no-store` headers rather than public bucket URLs.

Errors use `{ "error": { "code": "...", "message": "..." } }` with English messages. Common statuses are `400` invalid form/ID/date, `401` unauthorized, `404` missing profile/document/bytes, `409` category quota, `413` size limit, `415` unsupported/mismatched format, and `503` missing configuration. Unexpected operational errors return a generic `500` without filesystem paths or SDK internals.

## Failure handling

If storage succeeds but the database insert fails, the API attempts to remove the unregistered object. Cleanup failures are logged with the generated storage key for reconciliation. SQLite and object storage do not share a distributed transaction; a process crash or ambiguous R2 timeout can still leave an orphaned object.

Deletion removes bytes before metadata. If storage fails, the metadata remains for retry. If the database delete then fails, repeating the deletion succeeds because storage deletion is idempotent. If a file is missing, download returns `404` and DELETE can still remove its stale metadata. R2 bucket versioning may retain historical versions according to bucket lifecycle rules.

## Verification

```bash
bun run test:files
bun run test:profiles
bun run db:check
bun run lint
bun run build
bun run test:files:http
```

Tests use temporary directories and in-memory SQLite with the real migrations. They cover the local HTTP adapter, bearer auth, parent scoping, file signatures, bounded request bodies, concurrent quotas, failure cleanup, symlink/path escape rejection and downloads. On Windows expect 9/10 (known symlink failure: symlink escapes are rejected before the privilege-dependent check). The real AWS SDK is exercised against an in-process R2-compatible HTTP fixture, including a switch from R2 to local while preserving access to old objects. This does not constitute a live test against a configured cloud bucket.

Profile tests cover draft persistence, approval, expiry, session ownership, same-origin mutations, browser-authorized document operations and protection of profiles already used for matching.

After a build, `test:files:http` starts the compiled Next.js server on a free loopback port with its own temporary database and upload directory. It verifies the actual HTTP route exports and stops that test server afterwards; it does not change the main development server or application data.
