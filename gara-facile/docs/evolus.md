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
| Agent | Gara Facile Assistant (library attached) | `EVOLUS_AGENT_ID` | `POST /api/ai/chat`, workflow step |
| Agent | Gara Facile Matching | `EVOLUS_MATCH_AGENT_ID` | "Find matches" (`requestEvolusMatches`) |
| Extractor | Gara Facile — Tender requirements | `EVOLUS_EXTRACTOR_AGENT_ID` (agent) + `EVOLUS_EXTRACTOR_ID` (output format) | `POST /api/ai/evolus/extract` |
| Workflow | Gara Facile — Tender intake | `EVOLUS_WORKFLOW_ID` | `POST /api/ai/evolus/workflow` |
| Library | Gara Facile — Company KB (RAG) | `EVOLUS_LIBRARY_ID` | `POST /api/ai/evolus/library/sync` |
| Widget | Chat bubble on the Assistant | `EVOLUS_WIDGET_TOKEN` | `<EvolusWidget />` in the layout |

Authentication for REST calls is `X-ApiKey` + `X-Application-Id`; the chat endpoint is OpenAI-compatible with model `<applicationId>:<agentId>`.

## What each block does

- **Assistant** answers questions about the company from the library and cites the source file. It never decides eligibility.
  Test question `Abbiamo la certificazione ISO 27001?` → answers that only ISO 9001:2015 is listed, no ISO 27001, source `scheda-azienda-demo-….txt`.
- **Matching** scores TED notices against the approved profile and replies JSON only. Check with 2 candidates: 6.9 s,
  valid JSON, software notice `partial` 70, food-supply notice `none` 0.
- **Extractor** reads a tender PDF and returns the participation requirements with page and literal quote.
  Tender 691579-2026 (Alatri): 8 requirements in about 2.5 minutes, page numbers and quotes correct. Against our own extractor, all 8
  Evolus items match an item of ours (±1 page); we have 2 extra (duplicates). Because it takes minutes, the route runs it in the
  background (`POST` → 202, `GET ?tenderId=` → status or result) and caches the result in `var/evolus/`.
- **Workflow** runs Start (API) → extractor → Assistant → output. Run on 691579-2026: Completed in 68.6 s, 3 steps,
  returns a short Italian summary of the requirements with page numbers.
- **Widget** is the Assistant's chat bubble, limited to `localhost:3000`, `localhost:3100` and `garefacile.empovaro.com`.

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
