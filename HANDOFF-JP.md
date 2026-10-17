# Bloque Evolus (D1–D11) · JP

> Fecha: 17 oct 2026. JP lleva también el bloque Evolus.
> Cierre: 18 oct 10:00 VET · congelar funciones: 18 oct 04:00 VET.
> Guía de cada issue: `division-ai/EVOLUS.md`. Portal Evolus paso a paso: `division-ai/EVOLUS-CHROME.md`.
> Linear: proyecto "Gara Facile — IA + Evolus" (issues de JP: BAL-101…111). Este archivo también está como documento en Linear.

## 1. Estado
| Issue | Estado | Commit / pruebas |
|---|---|---|
| D3 BAL-103 `ai/profileFacts.ts` + empresa demo | hecha | 021c388 · test:ai ok |
| D1 BAL-101 llaves Evolus | hecha | 7930d44 · `GET /workflows` 200 |
| D2 BAL-102 cliente `ai/evolus.ts` | hecha | 64b72d1 + 97ecebf |
| D4 BAL-104 biblioteca | hecha | f2655d5 · test:ai 13/13 · subida real 201, indexada |
| D5 BAL-105 BYOM | pendiente ⛓ tu vLLM (J1) | |
| D6 BAL-106 borrador | pendiente ⛓ tu `llm.ts` (J3) | |
| D7 BAL-110 agente + `/api/ai/chat` | pendiente ⛓ D4 + D5 | |
| D8 BAL-107 `/api/ai/amd-stats` | pendiente ⛓ tu `ai_runs` | |
| D9 BAL-111 extractor Evolus | pendiente ⛓ D5 + J5 | |
| D10 BAL-108 `docs/evolus.md` | pendiente | |
| D11 BAL-109 workflow TED (P2) | solo si sobra tiempo | |

Rama de trabajo: `docs/hackathon-plan`. `main` no se toca hasta fusionar lo tuyo y lo de JP.

## 2. Llaves (nunca en git)
- JP te pasa por privado el archivo `evolus-jp.env`. Pega sus líneas en `gara-facile/.env`.
- Contiene `EVOLUS_API_KEY` y `EVOLUS_APP_ID` (con valor). `EVOLUS_LIBRARY_ID` también va puesto. Vacíos: `EVOLUS_AGENT_ID`, `EVOLUS_EXTRACTOR_ID`, `EVOLUS_BASE_URL`.
- Prueba gratis de que la llave funciona: `GET https://api.evolus.ai/api/v1/workflows` con headers `X-ApiKey` + `X-Application-Id` → 200.
- No imprimas la llave en logs, commits, Linear ni chats.

## 3. Lo que ya existe (para reutilizar)
- `app/services/ai/evolus.ts`
  - `evolusRequest(path, init, deps?)`: llamadas REST a `https://api.evolus.ai/api/v1` con las llaves, timeout de 30 s, `EvolusApiError` (status + body) y log JSON sin secretos. Con `FormData` no fuerza el `Content-Type`, así que las subidas multipart funcionan.
  - `evolusChat(messages, conversationId?, deps?)`: chat OpenAI-compatible con el agente (`model "<appId>:<agentId>"`, `X-Conversation-Id`). Necesita `EVOLUS_AGENT_ID` (D7).
- `app/services/ai/profileFacts.ts`: `getCompanyFacts(businessRecordId?)` devuelve `CompanyFacts`; sin id o sin base de datos usa la empresa demo (`fixtures/company/demo-company.json`).
- `app/services/ai/_contract.mock.ts`: copia provisional del contrato. Cuando publiques `types.ts`, cambia los imports a `./types` y borra el mock.

## 4. D4: hecha (lo que hay)
**Código (en `docs/hackathon-plan`, f2655d5):**
- `app/services/ai/library.ts`
  - `companyFactsText(facts)`: ficha de empresa en texto, en italiano.
  - `syncLibrary(files, language, deps?)`: sube a `POST /memories/{EVOLUS_LIBRARY_ID}/documents?language=it`. Pone una huella (sha256, 12 caracteres) en el nombre del archivo y salta lo que ya está en la biblioteca. Salta los formatos no soportados (vale: txt, md, csv, json, xml, html, pdf, docx). Para en el primer error, sin reintentos.
- `app/api/ai/evolus/library/sync/route.ts`: `POST { businessRecordId? }`.
  - Sin id: sube solo la ficha demo.
  - Con id: exige la cookie de sesión del perfil (como las rutas de documentos) y sube la ficha + los documentos del perfil.
  - Responde `{ libraryId, uploaded: [{ title, documentId }], skipped: [{ title, reason }] }`.
- `app/services/ai/library.test.ts`: 4 pruebas con `fetch` falso.

**Prueba real (17 oct, hecha):**
1. Biblioteca creada en el portal: `Gara Facile — Company KB`, tipo **RAG library** (el tipo ya no se puede cambiar), motor `openai/text-embedding-3-small`, PDF READING `Let Evolus decide`. No había otra igual. La otra que existe, `arepa-powerMemory1`, está vacía y no se usa.
2. `EVOLUS_LIBRARY_ID` está puesto en el `.env` de JP y en `evolus-jp.env`.
3. `curl -s -X POST http://localhost:3000/api/ai/evolus/library/sync -H "Content-Type: application/json" -d "{}"` → subió `scheda-azienda-demo-3c278b17149f.txt` (201).
4. `GET /memories/{id}/documents` → el `title` conserva la huella y `ingestionStatus` = 2, `chunkCount` = 2, `ingestionError` = null. Indexado.
5. La segunda llamada responde `uploaded: []`, `skipped: [{ reason: "unchanged" }]`. No sube duplicados.

**Notas del portal (rediseño):**
- `/company/libraries` ahora es `/libraries`.
- Los créditos están en `/company/billing/credits` y el uso en `/company/billing/usage`.
- La URL del portal no muestra el ID de la biblioteca: sale en la pestaña de red (`memories/{id}/documents`).
- `GET /api/v1/memories` (listar bibliotecas) da 401 con la llave de la app, porque pide llave de usuario.

**Pendiente menor:**
- Mirar en `/company/billing/credits` cuánto gastó la indexación (antes había 49.998).
- Probar la ruta con `businessRecordId` (necesita la base de datos local y la cookie del perfil).

## 5. Siguientes (resumen; el detalle está en EVOLUS.md)
- **D5 BYOM:** portal `/own-models` → `+ Connect your own server` → `OpenAI-compatible` → `BASE URL` `http://<ip>:8001/v1` (Qwen) + key de vLLM → **Test connection** en verde → Save. Nunca "Save anyway" con el test en rojo.
- **D7 agente:** `/agents` → `I'd rather start from scratch` (no usar "Describe it to Evo", que gasta IA). Usa el modelo BYOM + la biblioteca de D4. Instrucciones: responde sobre la empresa y la licitación, cita la fuente y **nunca decide la elegibilidad**. Guarda `EVOLUS_AGENT_ID`. Ruta `POST /api/ai/chat { message, conversationId? }` → `evolusChat()`. Prueba: "¿Tenemos ISO 27001?".
- **D6 borrador:** `ai/draft.ts` + `POST /api/ai/draft` con `chat({ role: "draft" })` de `llm.ts`. Solo usa datos de `CompanyFacts` y cada sección termina con "Generato con IA — da revisionare". Estado `draft`, nunca se envía solo.
- **D8:** `GET /api/ai/amd-stats` lee `ai_runs`.
- **D9:** extractor Evolus con schema `Requirement[]`, `ask-file?useWebhook=false`, y comparación con el tuyo.
- **D10:** `docs/evolus.md` para el jurado (bloques, rutas, IDs sin llaves, capturas, `curl`).

## 6. Reglas de créditos Evolus
- Anota el saldo antes y después de cada cosa que gaste (indexar, extractor, IA de Evolus). BYOM no gasta créditos de Evolus.
- Nunca reintentes en bucle: como mucho 1 reintento manual, y luego para.
- Ante 402 (sin créditos), 429 (más de 60 peticiones por minuto) o 409 (workflow apagado): para.
- Prueba con 1 documento antes de subir más. Siempre `language` explícito (`it`).
- No crees recursos duplicados. No aceptes upgrades ni pruebas de pago.

## 7. Comandos y problemas conocidos
- Pruebas: `bun run test:ai`, `bun run test:match`, `bunx eslint app/services/ai app/api/ai`.
- `test:profiles` / `test:files` necesitan `bun run db:generate` en un clon limpio.
- `tsc --noEmit` tiene errores previos y ajenos en `app/layout.tsx` y `match/find-matches.test.ts:118`.
- El repo no usa Prettier.
- Commits: Conventional Commits, `git add` con rutas explícitas.

## 8. Evolus: valores por actualizar
- `EVOLUS_LIBRARY_ID`: `4fc28ed1-70ca-f111-bf5b-6045bd9ce552` (un ID, no una llave)
- Créditos: 49.998 antes y después de crear la biblioteca (crearla no gasta). Después de indexar la ficha: _por mirar en el portal_.
- Workspace: `arepa-power` (Developer Event). Capturas: en el PC de JP, `Downloads\d4\`.
