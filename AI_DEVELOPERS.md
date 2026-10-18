# Gara Facile — Guía para los 2 desarrolladores de IA

> **División vigente por persona (JP):** ver [`division-ai/`](division-ai/GENERAL.md). Donde este documento dice "Dev A / Dev B", manda la asignación de esa carpeta.

Alcance: **todo el apartado de IA** (infra AMD, modelos, extracción, reglas/matriz, borrador, Evolus, benchmark). El resto del equipo hace UI, deploy (Dokploy → `garefacile.empovaro.com`), video y slides.

> Deadline duro: **18 oct 10:00 AM (hora Venezuela)**. Pitch 11:00 AM. Ver horario en la sección 7.
> Estado del repo y prioridades generales: `TASKS.md`. Este documento es el detalle de IA.

## 0. Decisiones ya tomadas (no reabrir)

| Tema | Decisión |
|---|---|
| Alcance | Piso garantizado = vertical slice (a) → luego (b) benchmark + traductor → luego (c) extras. |
| Casos de demo | PyME **italiana de software**; 3 licitaciones **reales de TED, cacheadas** como fixture; PDFs curados. Requisitos coherentes con software (ISO 27001, calificación cloud AgID, facturación, garantía, proyectos similares, plazo). **No usar "SOA OS30"** (es de obras eléctricas). |
| Búsqueda TED | **Lugar de ejecución según la cobertura del perfil** (local/nacional → país propio; internacional → países elegidos); sin filtro por país fijo ni filtro CPV (fuera de alcance) → los pliegos pueden venir en varios idiomas; la extracción debe ser multilingüe y el borrador sale en el idioma del pliego (en la demo: italiano). Solo avisos de competencia activos. |
| Modelos | **Gemma-4-31B-IT para todo** vía AMD Token Factory (endpoint OpenAI-compatible, 20 RPM). La opción 3 (Gemma + Qwen2.5 en 1 MI300X propio) se **descartó**: sin créditos para droplet. |
| Extracción | **Híbrido**: parser propio por página (garantiza nº de página) + LLM extrae requisitos en JSON. Evolus como bloque (extractor + knowledge library + workflow), no como único camino. |
| Reglas | **6 tipos fijos**: certificación, facturación mínima, garantía provisional %, proyectos similares (nº y valor), plazo de ejecución/entrega, deadline de oferta. **El LLM jamás decide elegibilidad**: reglas en código. |
| Reclamos | Abogado/PwC = "validador futuro", no partner. Solo mostrar números **medidos**. |
| Idiomas | UI y README en inglés; borrador en italiano. |

## 1. Arquitectura de IA (flujo)

```
TED (searchNotices, ya existe) ──► contracts + lotes (DB)
                                        │
         PDF del pliego ──► [Dev B] parser por página ──► páginas[{n, texto}]
                                        │
                              [Dev B] extractor LLM (Gemma, JSON guiado)
                                        │  Requirement[]  (con page + quote)
                                        ▼
 Ficha empresa (DB + Evolus library) ──► [Dev B] motor de reglas (código puro)
                                        │  ComplianceResult[] + score 0-100
                                        ▼
                    [Dev A] borrador de oferta (Gemma, idioma del pliego)
                                        │
                              Humano aprueba (nunca envía solo)
```

- Todo el LLM entra por **una interfaz OpenAI-compatible** con dos pares de variables (una por rol); ambas apuntan al mismo modelo Gemma en Token Factory:
  - `LLM_EXTRACT_BASE_URL`, `LLM_EXTRACT_MODEL`, `LLM_EXTRACT_API_KEY`
  - `LLM_DRAFT_BASE_URL`, `LLM_DRAFT_MODEL`, `LLM_DRAFT_API_KEY`
- Evolus (de `evolus doc.rar`, ver `04-developers/`): `EVOLUS_API_KEY`, `EVOLUS_APP_ID`, `EVOLUS_AGENT_ID`, `EVOLUS_WORKFLOW_ID`, `EVOLUS_LIBRARY_ID`. Headers REST: `X-ApiKey` y `X-Application-Id`.
- Código nuevo va en `gara-facile/app/services/ai/` (nada de IA dentro de `app/services/TED` ni `business`).

## 2. Contrato entre desarrolladores (acordar en la primera hora y congelar)

Crear `gara-facile/app/services/ai/types.ts` con estos tipos (ajustar nombres, no la forma):

```ts
export type RequirementKind =
  | "certification" | "min_turnover" | "bid_guarantee"
  | "similar_projects" | "execution_deadline" | "submission_deadline";

export interface Requirement {
  id: string;
  kind: RequirementKind;
  description: string;      // texto normalizado (idioma original)
  value?: number | string;  // umbral: 500000, "ISO 27001", 0.02, "90 days"
  unit?: string;            // "EUR" | "%" | "days" | "count"
  page: number;             // OBLIGATORIO: página del pliego (1-based)
  quote: string;            // fragmento literal que lo sustenta
  confidence: number;       // 0..1 (solo informativo)
}

export type ComplianceStatus = "MEETS" | "FAILS" | "MISSING_DOC";

export interface ComplianceResult {
  requirementId: string;
  status: ComplianceStatus;
  page: number;
  reason: string;           // ej. "Falta ISO 27001" / "Balances 2023-2025: 720k >= 500k"
  evidence?: string;        // campo de la ficha / documento usado
}

export interface TenderAnalysis {
  tenderId: string;         // OJS/publication-number
  lotId?: string;
  results: ComplianceResult[];
  score: number;            // 0..100, función determinista
  verdict: "GO" | "NO_GO" | "REVIEW";
  generatedBy: { model: string; ms: number; tokens?: number };
}
```

Reglas del contrato:
- Sin `page` + `quote` el requisito **se descarta** (no se muestra). Esto es lo que da la "cita de página".
- `score` se calcula con una fórmula determinista (documentada en `ai/scoring.ts`), nunca con el LLM.
- Frontend/backend consumen **solo** `TenderAnalysis`. Si cambia, avisar al resto.

## 3. Dev A — Inferencia, redacción, traducción, benchmark

Dueño de: AMD (Token Factory) + cliente LLM + borrador + panel AMD + benchmark. Traducción: descartada (no existe `ai/translate.ts`).

### A1. Droplet MI300X + vLLM — DESCARTADO

Sin créditos para droplet propio: no se levantó ninguna MI300X ni ningún vLLM. El modelo es **Gemma-4-31B-IT vía AMD Token Factory** (endpoint OpenAI-compatible, ver `LLM_*` en `.env.example`). Los scripts de `infra/amd/` (`serve-gemma.sh`, `serve-qwen.sh`, `README`) quedan solo como referencia para reproducir ese montaje en el futuro.

### A2. Cliente LLM y observabilidad
- `ai/llm.ts`: `chat({ role: "extract"|"draft", messages, schema?, signal })` sobre `fetch` OpenAI-compatible; timeout, 1 reintento, validación de JSON con `zod` (o similar).
- Medir por llamada: ms, tokens in/out, modelo. Guardar en tabla `ai_runs` → alimenta el **panel AMD** (modelo, GPU, llamadas, ms, tokens/s; sin costo/min). Visible en `/tenders` (*Running on AMD*) y `GET /api/ai/amd-stats`.
- Endpoint `GET /api/ai/health` que consulta `/v1/models` del servidor de Token Factory (la demo muestra modelo + ✔).

### A3. Borrador de oferta (Gemma)
- `ai/draft.ts`: entrada = `Requirement[]` + `ComplianceResult[]` + ficha empresa (+ proyectos de referencia) → salida = borrador estructurado (secciones: presentación, experiencia, plan de ejecución, cumplimiento de requisitos) **en el idioma del pliego** (demo: italiano).
- Reglas anti-alucinación: el prompt solo permite usar datos de la ficha; cada afirmación numérica se rellena **desde campos**, el LLM solo redacta alrededor. Marca "Generado con IA — revisar" en cada sección.
- Sin `status=FAILS` críticos no se genera (o se genera con advertencias visibles).
- Criterio de aceptación: borrador completo medido y guardado (un borrador real: 53,149 ms, 1,010 prompt tokens, 408 completion tokens, vía Token Factory).

### A4. Traducción — DESCARTADA

No existe `ai/translate.ts`. La matriz muestra `description`/`quote` en el idioma del pliego (demo: italiano); no se traduce ni se hace rerank.

### A5. Benchmark (fase b)
- `scripts/benchmark.ts`: sobre el set etiquetado de Dev B, medir (1) precisión/recall de requisitos, (2) % de decisiones correctas de la matriz, (3) tiempo end-to-end por licitación, (4) tokens y costo estimado en la GPU. Salida a `docs/benchmark.md` con fecha y comando para reproducir.
- Comparar con la línea base "a mano ≈ 15 h" **solo como estimación declarada** (no medida).

## 4. Dev B — Entender el pliego, reglas, matriz, Evolus

Dueño de: parser, extractor, motor de reglas, score, set de evaluación, bloques Evolus.

### B1. Parser de pliegos por página
- `ai/pdf.ts`: PDF → `[{ page: number, text: string }]` con `unpdf` (probado con los 3 PDFs de la demo). Si una página sale vacía (escaneo) → marcar `needsOcr`; para la demo se usan PDFs con texto.
- Requisitos guardados y revisados en `fixtures/tenders/<id>.requirements.json`; el análisis los reutiliza y solo extrae en vivo si faltan. Pliegos demo fijados en `fixtures/tenders/`; tablas `tender_documents` y `tenderAnalyses` en DB.

### B2. Extractor de requisitos (Gemma)
- `ai/extract.ts`: por ventanas de páginas (p. ej. 6–8 páginas), prompt + **JSON schema** de `Requirement[]` (6 tipos). Fusionar y deduplicar; descartar items sin `page`+`quote`; verificar que `quote` aparezca realmente en el texto de esa página (comprobación determinista → mata alucinaciones).
- Normalizar umbrales (`€1.500.000` → `1500000`, `2%` → `0.02`, "90 giorni" → `90 days`).
- Prompts versionados en `ai/prompts/`.

### B3. Ficha de empresa → hechos
- Completar el perfil (campos + UI del wizard ya entregados: `cpvCodes`, `certifications`, `languages`, facturación anual, nº empleados, PyME, rango de contrato, proyectos de referencia).
- `ai/profileFacts.ts`: devuelve `CompanyFacts` tipado; la demo usa una empresa ficticia de software italiana ("Load example").

### B4. Motor de reglas (código puro, tests obligatorios)
- `ai/rules.ts`: una función por `RequirementKind` → `ComplianceResult`.
  - `certification`: ¿existe en `certifications` y no vencida? si el requisito exige y la ficha no lo tiene → `FAILS`; si está pero sin documento subido → `MISSING_DOC`.
  - `min_turnover`: promedio/mínimo de los años según el pliego vs ficha.
  - `bid_guarantee`: porcentaje × valor del lote vs capacidad/ficha declarada (`MISSING_DOC` si no hay aval).
  - `similar_projects`: nº y valor mínimo vs proyectos de referencia.
  - `execution_deadline`: plazo pedido vs capacidad declarada.
  - `submission_deadline`: fecha límite vs ahora (+ margen configurable) → `FAILS` si ya venció.
- `ai/scoring.ts`: score determinista (pesos documentados). Veredicto: `GO` (todo MEETS), `REVIEW` (hay MISSING_DOC), `NO_GO` (algún FAILS).
- Tests (`bun test`/`tsx --test`) con casos de borde; **estos tests son parte de la defensa ante el jurado** ("el LLM no decide").

### B5. Set de evaluación (necesario para que A5 mida algo real)
- Etiquetar **a mano** 10–20 requisitos de los 3 PDFs demo en `fixtures/eval/labels.json` (`{doc, page, kind, value}`) y el resultado esperado de la matriz para la empresa ficticia.
- Mantenerlo pequeño pero real: es lo que respalda "precisión de la matriz".

### B6. Bloques Evolus (mínimo 2; el workspace ya está creado)
Prioridad (todo entregado):
1. **Knowledge library** con la ficha de la empresa (documentos de certificados/proyectos). Subir con `POST /api/v1/memories/{LIBRARY_ID}/documents?language=it` (¡`language` explícito!).
2. **Extractor** de documentos: schema de `Requirement[]`, llamado como **segunda opinión** del extractor propio (`/agents/{EVOLUS_EXTRACTOR_AGENT_ID}/json/{EVOLUS_EXTRACTOR_ID}/ask-file`, con `?useWebhook=false`). La comparación se muestra en `/tenders` (*Evolus vs our extractor*).
3. **Workflow** *Tender intake* (Start → extractor → Assistant → output); las rutas `POST /api/ai/evolus/workflow` y `GET …/{executionId}` existen.
4. **Agente**: chat sobre la ficha con el modelo conectado (BYOM → Token Factory, Gemma). Claves **solo en variables de entorno** (`EVOLUS_AGENT_ID`, `EVOLUS_MATCH_AGENT_ID`); la ruta `POST /api/ai/chat` existe pero ninguna UI la usa (la UI es el widget).
- Claves **solo en variables de entorno**; el equipo de Evolus revisa uso de API y configuración del workspace, así que las llamadas deben quedar registradas (usar la REST API, no solo la UI).

## 5. Dependencias con el resto del equipo

- **TED**: `app/services/TED/fetch.ts` con caller real (*Find matches*): solo avisos de competencia activos, con `submission-url-lot`, `document-url-lot` y fallback lote→procedimiento. Lugar de ejecución según cobertura del perfil; sin filtro CPV (fuera de alcance).
- **DB**: `TenderAnalysis` se guarda como JSON en la tabla `tenderAnalyses`; contratos y matches en `contracts`/`contract_matches`.
- **UI**: lista de licitaciones en `/tenders` (rojo/verde), detalle con matriz, panel AMD y botón "Aprobar". Leen `TenderAnalysis`.
- **Deploy (Dokploy)**: la app llama a `LLM_*_BASE_URL` (Token Factory) desde `garefacile.empovaro.com`.

## 6. Seguridad y reglas de oro

- **Las llaves viven solo en `.env` / variables de Dokploy. Nunca en git, logs, capturas ni chat.** La `EU_API_KEY` de TED y la llave `rc-…` de Evolus ya circularon por chat: tratarlas como expuestas y rotar al terminar el hackathon (o ya si el chat es compartido).
- `.env` ya está ignorado por git; verificar con `git status` antes de cada commit. Añadir las variables nuevas a `.env.example` (sin valores).
- Sin endpoints abiertos: toda llamada LLM lleva su API key desde env.
- El agente **nunca envía** ofertas; solo propone, el humano aprueba. Etiquetar contenido generado por IA.
- No presentar métricas no medidas como medidas. El deck decía 92 %, 4'37'', 25 min: son metas hasta que `docs/benchmark.md` las respalde.

## 7. Cronograma (histórico: el evento ya cerró)

Se conserva como registro. La entrega fue 18 oct 10:00 AM VET; el plan B (Gemma para todo vía Token Factory) se convirtió en el plan final y se sacrificaron traductor, rerank y vLLM propio.

| Bloque | Dev A | Dev B | Puerta |
|---|---|---|---|
| T+0–1 h | Droplet, HF token, vLLM Gemma | Congelar `types.ts` con A y backend; parser de PDF sobre los 3 demos | Contrato firmado |
| T+1–2 h | vLLM Qwen, prueba JSON guiado, `llm.ts` | Extractor con mock/Qwen | **Puerta modelos**: ok → opción 3, si no → plan B |
| T+2–5 h | Borrador (Gemma), health + panel AMD | Reglas + scoring + tests, ficha de empresa | Matriz correcta en los 3 lotes |
| T+5–8 h | Integración con UI, `ai_runs` | Evolus: library + extractor + REST | ≥2 bloques Evolus llamados por API |
| T+8–11 h | Benchmark (fase b), traducción | Set etiquetado, afinado de prompts | Números medidos |
| Hasta ~04:00 AM | **Congelar features** | **Congelar features** | — |
| 04:00–08:00 | Video con la demo, capturas del panel AMD | Verificar README/Docker desde cero | Prueba desde cero OK |
| 08:00–09:30 | Subir a lablab (descripciones, tags, repo público, URL, video, slides, portada) | Smoke test del URL | Envío listo |
| **10:00 AM** | **Cierre de entregas** | | |
| 11:00 AM | Pitch | | |

Si algo falla en una puerta, **recortar, no retrasar**: primero se sacrifican traducción, rerank, agente Evolus y workflow diario; el piso es matriz + borrador + panel AMD + 2 bloques Evolus.

> Lo sacrificado al final: traductor, rerank, filtro CPV, pantalla de asistente in-app y vLLM propio (ver §8).

## 8. Definition of Done (IA)

- [x] Gemma sirve vía AMD Token Factory (vLLM propio en MI300X descartado); panel AMD visible en la app.
- [x] 3 pliegos demo → `Requirement[]` con página y cita verificable.
- [x] Matriz determinista con los 6 tipos; tests de reglas pasan.
- [x] 2 rojos y 1 verde coherentes con la empresa ficticia; score reproducible.
- [x] Borrador en italiano generado en AMD, con aviso IA y aprobación humana.
- [x] ≥2 bloques Evolus usados por REST con llaves en entorno.
- [x] `docs/benchmark.md` con números medidos y comando para reproducir.
- [x] Todo corre con `docker compose up` desde cero y en `garefacile.empovaro.com`.
