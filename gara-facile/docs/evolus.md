# Evolus integration

Gara Facile uses Evolus as its business-agent layer, with an open model served on AMD infrastructure
connected as the workspace's own model (BYOM). Numbers below were measured on 17-18 Oct 2026.

## Model

- Connection: **AMD Token Factory Gemma**, OpenAI-compatible, base `https://developer.amd.com.cn/radeon/api/v1`.
- Model used by every agent, extractor and workflow step: **Gemma-4-31B-IT** (Google, open weights).
- Evolus connection test: short answer 1222 ms, tool calling 2851 ms, streaming 3421 ms, all green.
- The workspace has no Evolus-hosted model in use: agents, the extractor and the workflow run only on the connected model.
- Caveat for the track rule "open model on your own vLLM endpoint on AMD Developer Cloud": we reach AMD-served
  Gemma through Token Factory, not a vLLM droplet of our own (the account had no droplet credits).

## Building blocks

| Block | Name | Env var | Used by the app |
|---|---|---|---|
| Agent | Gara Facile Assistant (library attached) | `EVOLUS_AGENT_ID` | API-only: `POST /api/ai/chat`, workflow step (no UI client uses it) |
| Agent | Gara Facile Matching | `EVOLUS_MATCH_AGENT_ID` | "Find matches" (`requestEvolusMatches`) |
| Extractor | Gara Facile — Tender requirements | `EVOLUS_EXTRACTOR_AGENT_ID` (agent) + `EVOLUS_EXTRACTOR_ID` (output format) | `POST /api/ai/evolus/extract` |
| Workflow | Gara Facile — Tender intake | `EVOLUS_WORKFLOW_ID` | `POST /api/ai/evolus/workflow` |
| Library | Gara Facile — Company KB (RAG) | `EVOLUS_LIBRARY_ID` | `POST /api/ai/evolus/library/sync` |
| Widget | Chat bubble on the Assistant | `EVOLUS_WIDGET_TOKEN` | `<EvolusWidget />` in the layout |

Authentication for REST calls is `X-ApiKey` + `X-Application-Id`; the chat endpoint is OpenAI-compatible with model `<applicationId>:<agentId>`.

## What each block does

- **Assistant** answers questions about the company from the library and cites the source file. It never decides eligibility. No UI uses `POST /api/ai/chat` directly; the in-app assistant is the widget bubble.
  Test question `Abbiamo la certificazione ISO 27001?` → answers that only ISO 9001:2015 is listed, no ISO 27001, source `scheda-azienda-demo-….txt`. There is no in-app chat screen (out of scope).
- **Matching** scores TED notices against the approved profile and replies JSON only. Check with 2 candidates: 6.9 s,
  valid JSON, software notice `partial` 70, food-supply notice `none` 0.
- **Extractor** reads a tender PDF and returns the participation requirements with page and literal quote.
  Tender 691579-2026 (Alatri): 8 requirements in about 2.5 minutes, page numbers and quotes correct. Against our own extractor, all 8
  Evolus items match an item of ours (±1 page); we have 2 extra (duplicates). Because it takes minutes, the route runs it in the
  background (`POST` → 202, `GET ?tenderId=` → status or result) and caches the result in `var/evolus/`.
- **Workflow** runs Start (API) → extractor → Assistant → output. Run on 691579-2026: Completed in 68.6 s, 3 steps,
  returns a short Italian summary of the requirements with page numbers.
- **Widget** is the Assistant's chat bubble. The allowed domains are configured portal-side; on localhost the widget returns 403 ORIGIN_NOT_ALLOWED, which is expected. The deployed app at `garefacile.empovaro.com` is allowed.

## Cost

Workspace on the Developer Event trial with 50,000 credits. After the 8 operations above (library indexing, chat, 3 extractions
including one inside the workflow, a workflow run, a matching call) the portal reports **0 credits used** and a closing balance of
50,000, because every step runs on our own model. Eligibility is never decided by any model: fixed rules do it.

## Reproduce

1. Set the `EVOLUS_*` variables from `.env.example`.
2. `POST /api/ai/evolus/library/sync` once to upload the company sheet.
3. `POST /api/ai/chat {"message":"Abbiamo la certificazione ISO 27001?"}`.
4. `POST /api/ai/evolus/extract {"tenderId":"691579-2026"}`, then poll `GET /api/ai/evolus/extract?tenderId=691579-2026`.
5. `POST /api/ai/evolus/workflow {"tenderId":"691579-2026"}`, then `GET /api/ai/evolus/workflow/{executionId}`.

## Known limits

- The extractor format is a hand-written JSON template (the visual editor has no list type), so adding a field means editing it in the portal.
- Evolus calls are synchronous for extraction; the 600 s client timeout is a ceiling, not an expectation.
- Next dev with Turbopack on Windows sometimes crashes its CSS worker (`exit 0xc0`); the Linux production build is unaffected.

## App endpoints (own code, Evolus/AMD underneath)

### `POST /api/ai/draft`

- Body: `{ "tenderId": string, "businessRecordId"?: number }`. `tenderId` is required; `businessRecordId`, when given, must be a positive integer.
- Auth: when `businessRecordId` is given, the request must carry the browser session that owns that profile (`authorizeProfileRequest`); without it, the draft uses the demo company (`fixtures/company/demo-company.json`).
- Reuses the latest saved analysis for that tender and scope (newest `tenderAnalyses` row); returns 404 `Run the analysis first.` when there is none. Never re-extracts: requirements come from `fixtures/tenders/<tenderId>.requirements.json` (404 when missing, 500 when unreadable).
- The model writes only the three narrative sections (company presentation, relevant experience, execution plan); the compliance statement is built deterministically from the analysis results, and every section ends with `Generato con IA — da revisionare`. Warnings flag `FAILS`, `MISSING_DOC`, and figures not found in the company facts.
- Rate limit: shares the analysis limiter under a separate `draft:` key (`draft:record:<id>` or `draft:ip:<ip>`), so drafts and analyses do not block each other; 429 carries `retry-after`.
- Errors: 400 on a missing/invalid body, 404 when no analysis or requirements exist, 502 when the draft model is unavailable (the provider body is never leaked), 503 when drafts are not configured. `maxDuration` 120.
- Response: `{ status: "draft", language: "it", sections[4], warnings[], generatedBy: { model, ms, promptTokens?, completionTokens? } }`.

### `GET /api/ai/amd-stats`

- Reports what already happened: aggregates the saved `ai_runs` rows (up to 1000 scanned, 10 most recent shown). Never calls a provider and is never prerendered or cached.
- Returns the GPU label, the configured `{ role, model }` pairs for `extract` and `draft` (from env only — keys and URLs are never included), totals (`calls`, `ok`, `errors`, `promptTokens`, `completionTokens`), per-role `calls`, `avgMs`, `p50Ms`/`p95Ms` (nearest-rank) and `tokensPerSecond` (completion tokens over seconds, ok rows only), plus the last run and the recent list. Stored error texts are never surfaced.
- Without a configured database it returns the same shape over zero rows.

### `GET /api/ai/tenders`

- Query param: `?businessRecordId=<positive integer>`, optional; anything else is a 400. When present, the caller's session must own that profile.
- Lists tenders from the fixture directory (every `<id>.json` except `*.requirements.json`, metadata only — PDF bytes are never read) and attaches the latest saved analysis per tender: scoped to the given profile, or to the demo company (`businessRecordId IS NULL`) when the param is absent. Analyses are never mixed across profiles; without a database every tender gets `analysis: null, analyzedAt: null`. 503 when the fixture directory cannot be read.
- Response: `{ tenders: [{ id, title, lotId?, estimatedValueEur?, country?, language?, deadline?, noticeUrl?, documentUrl?, analysis, analyzedAt }] }`.

## Lablab submission (EN)

### Tagline

Gara Facile helps Italian SMEs read public tenders, check eligibility with evidence, and draft bids.

### Description (~300 words)

Gara Facile helps Italian small businesses decide whether a public tender is worth bidding on. Tender packs (disciplinari) are long Italian legal documents where a single missed line can mean exclusion; the app extracts each participation requirement with its page number and literal quote, checks it against the company profile with deterministic rules, and drafts the bid in Italian.

Extraction runs on Gemma-4-31B-IT served on AMD infrastructure through an OpenAI-compatible endpoint. On our 3 hand-labeled tenders (14 requirements, see docs/benchmark.md), extraction reached precision 0.68 (13/19) and recall 0.93 (13/14); the saved extraction runs in the fixtures' stats took 39,662 ms, 53,837 ms and 81,574 ms. The sample is small, so every percentage is indicative, not significant.

Eligibility is never decided by the model: a fixed rule engine over the requirement kinds produces MEETS, FAILS or MISSING_DOC per requirement, a score from 0 to 100, and a GO / NO_GO / REVIEW verdict. On the same 3 tenders the benchmark reports verdict accuracy 3/3 (scores 13, 100 and 53, matching the README run table) and requirement-level decision accuracy 13/13. The draft endpoint reuses the saved analysis and the extracted requirements, never re-extracts, and appends a "Generato con IA — da revisionare" footer to every section; a person approves anything that leaves the system.

Evolus provides the business-agent layer on the same model, connected as the workspace's own model: the Assistant answers company questions from a knowledge library, the Matching agent scores TED notices, the extractor gives a second opinion on tender PDFs, and the Tender intake workflow runs extract-to-summary. Measured on 17-18 Oct 2026 and listed in the README tables, the extractor returned 8 requirements with page and quote in about 2.5 minutes, the workflow completed in 68.6 s over 3 steps, and matching 2 candidates took 6.9 s; the workspace used 0 of its 50,000 credits because every step runs on our own model.
