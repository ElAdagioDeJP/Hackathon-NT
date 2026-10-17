# JP — Infra AMD, modelos, comprensión del pliego y motor de reglas

> Linear: asignado a **el sincero** · equipo Balanzo · proyecto "Gara Facile — IA + Evolus".
> Visión común, contrato, rutas y cronograma: [`GENERAL.md`](GENERAL.md). Detalle técnico extendido: [`../AI_DEVELOPERS.md`](../AI_DEVELOPERS.md) §1–§4.
> Congelar funciones: **18 oct 04:00 AM VET**.

**Responsabilidad:** que la IA corra en AMD y que el producto entienda el pliego y decida con reglas fijas si la empresa cumple. Todo lo de esta lista es tuyo de punta a punta: código, tests y prueba con `curl`.

**Entregas a JP** (ver `GENERAL.md` §6): `types.ts` (T+1 h), URL + key de vLLM y `llm.ts` (T+2 h), `Requirement[]` de los 3 pliegos (T+4 h).

---

## P0 — Imprescindible para entregar

### J1 · Droplet MI300X + vLLM (Gemma + Qwen) — *Urgent*
- Crear droplet MI300X en AMD Developer Cloud (cuenta con créditos lista). Anotar la IP. **Apagar/destruir cuando no se use.**
- Aceptar la licencia de Gemma en Hugging Face y crear `HF_TOKEN`.
- Levantar **en secuencia**, siempre con `--api-key` (verificar imagen `rocm/vllm` y versiones al momento):
  - Gemma clase 27B instruct, puerto 8000, `--gpu-memory-utilization 0.55`, `--max-model-len 16384`.
  - Qwen2.5-7B-Instruct, puerto 8001, `--gpu-memory-utilization 0.25`, `--enable-auto-tool-choice --tool-call-parser hermes`, `--max-model-len 32768`.
- Guardar `infra/amd/serve-gemma.sh`, `infra/amd/serve-qwen.sh` y `infra/amd/README.md` (reproducible en 5 min).
- Abrir 8000/8001 solo con key y, si se puede, limitado a la IP de Dokploy.
- **Puerta T+2 h:** ambos responden `POST /v1/chat/completions`, Qwen pasa una prueba de JSON guiado y una de tool-call. Si no pasa → **plan B**: Gemma sirve todo y solo cambia la config.
- **Hecho cuando:** `curl` a ambos puertos responde con key y falla sin key; la URL + key se le pasan a JP por canal privado (no por git).

### J2 · Contrato `app/services/ai/types.ts` — *Urgent*
- Tipos de `../AI_DEVELOPERS.md` §2 + `CompanyFacts` de `GENERAL.md` §3.
- **Hecho cuando:** JP lo revisó, está mergeado y se avisó a UI. Desde ahí, cambios solo con aviso.

### J3 · Cliente LLM `ai/llm.ts` + métricas + `/api/ai/health` — *Urgent*
- `chat({ role: "extract" | "draft", messages, schema?, signal })` sobre `fetch` OpenAI-compatible, leyendo `LLM_EXTRACT_*` / `LLM_DRAFT_*`.
- Timeout (60 s), 1 reintento ante 429/5xx, validación de JSON con `zod` (agregar a `package.json`; hoy no está).
- Cada llamada guarda `{role, model, ms, promptTokens, completionTokens, ok, createdAt}` en una tabla nueva `ai_runs` (Drizzle, `app/db/schema.ts`). JP la lee para el panel AMD.
- `GET /api/ai/health`: consulta `/v1/models` de ambos servidores → `{extract: {model, ok, ms}, draft: {...}, gpu: AMD_GPU_LABEL}`.
- Agregar las variables `LLM_*` y `AMD_GPU_LABEL` a `.env.example`.
- **Hecho cuando:** JP puede llamar `chat({ role: "draft", ... })` y aparece una fila en `ai_runs`.

### J4 · Pliegos demo + parser por página `ai/pdf.ts` — *Urgent*
- Elegir **3 licitaciones reales de TED** de software/servicios TI (preferible Italia) con PDF con texto (no escaneado) y guardarlas en `gara-facile/fixtures/tenders/` (PDF + JSON del aviso).
- `ai/pdf.ts`: PDF → `[{ page: number, text: string, needsOcr: boolean }]` (p. ej. `unpdf` o `pdfjs-dist`).
- Cache por hash del archivo (tabla `tender_documents` o JSON) para no reprocesar.
- **Hecho cuando:** los 3 PDFs dan texto por página con números correctos.

### J5 · Extractor de requisitos `ai/extract.ts` (Qwen) — *Urgent*
- Ventanas de 6–8 páginas → prompt + JSON schema de `Requirement[]` (6 tipos). Prompts versionados en `ai/prompts/`.
- Fusionar y deduplicar. **Descartar** lo que no tenga `page` + `quote`, o cuya `quote` no aparezca literalmente en el texto de esa página (comprobación determinista).
- Normalizar umbrales: `€1.500.000` → `1500000`, `2%` → `0.02`, `90 giorni` → `90 days`.
- **Hecho cuando:** los 3 pliegos devuelven requisitos con cita verificable; se le pasa el JSON a JP (`fixtures/tenders/*.requirements.json`).

### J6 · Motor de reglas `ai/rules.ts` + score `ai/scoring.ts` + tests — *Urgent*
- Una función por tipo → `ComplianceResult`: `certification`, `min_turnover`, `bid_guarantee`, `similar_projects`, `execution_deadline`, `submission_deadline` (criterios en `../AI_DEVELOPERS.md` §4 B4).
- Score determinista con pesos documentados en el archivo. Veredicto: `GO` (todo MEETS) · `REVIEW` (hay MISSING_DOC) · `NO_GO` (algún FAILS).
- Tests con `tsx --test` (agregar script `test:ai`) con casos de borde. **Son la defensa ante el jurado de que el LLM no decide.**
- Con la empresa demo de JP: **2 licitaciones en rojo y 1 en verde.**
- **Hecho cuando:** `bun run test:ai` pasa y el resultado es reproducible.

### J7 · Ruta `POST /api/ai/analyze` — *Urgent*
- Entrada: `{ tenderId, businessRecordId? }` (sin perfil → empresa demo). Orquesta pdf → extract → `profileFacts` (de JP) → rules → scoring.
- Guarda `TenderAnalysis` como JSON en una tabla nueva `tender_analyses` (no tocar `contract_matches` hasta acordarlo con backend).
- **Hecho cuando:** `curl` sobre los 3 pliegos devuelve `TenderAnalysis` válido en menos de 2 min cada uno.

## P1 — Suma puntos

### J8 · Set etiquetado + benchmark — *High*
- `fixtures/eval/labels.json`: 10–20 requisitos etiquetados a mano de los 3 PDFs + resultado esperado de la matriz.
- `scripts/benchmark.ts`: precisión/recall de requisitos, % de decisiones correctas, tiempo por licitación, tokens/s. Salida en `docs/benchmark.md` con fecha y comando.
- **Hecho cuando:** hay números medidos en MI300X que se pueden citar en el pitch.

## P2 — Si sobra tiempo

### J9 · Traducción `ai/translate.ts` — *Medium*
- Traducir `description`/`quote` a inglés/español con Gemma, con cache por hash. Suma al premio Google (Gemma visible).

---

## Checklist rápido
- [ ] J1 vLLM arriba (o plan B decidido) · [ ] J2 contrato congelado · [ ] J3 `llm.ts` + `ai_runs` + health
- [ ] J4 3 pliegos + parser · [ ] J5 extractor · [ ] J6 reglas + tests · [ ] J7 `/api/ai/analyze`
- [ ] J8 benchmark · [ ] J9 traducción
