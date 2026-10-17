# Gara Facile — Guía para los 2 desarrolladores de IA

> **División vigente por persona (JP / Henry):** ver [`division-jp-henry/`](division-jp-henry/GENERAL.md). Donde este documento dice "Dev A / Dev B", manda la asignación de esa carpeta.

Alcance: **todo el apartado de IA** (infra AMD, modelos, extracción, reglas/matriz, borrador, Evolus, benchmark). El resto del equipo hace UI, deploy (Dokploy → `garefacile.empovaro.com`), video y slides.

> Deadline duro: **18 oct 10:00 AM (hora Venezuela)**. Pitch 11:00 AM. Ver horario en la sección 7.
> Estado del repo y prioridades generales: `TASKS.md`. Este documento es el detalle de IA.

## 0. Decisiones ya tomadas (no reabrir)

| Tema | Decisión |
|---|---|
| Alcance | Piso garantizado = vertical slice (a) → luego (b) benchmark + traductor → luego (c) extras. |
| Casos de demo | PyME **italiana de software**; 3 licitaciones **reales de TED, cacheadas** como fixture; PDFs curados. Requisitos coherentes con software (ISO 27001, calificación cloud AgID, facturación, garantía, proyectos similares, plazo). **No usar "SOA OS30"** (es de obras eléctricas). |
| Búsqueda TED | **Toda la UE, sin filtro de país** → los pliegos pueden venir en varios idiomas; la extracción debe ser multilingüe y el borrador sale en el idioma del pliego (en la demo: italiano). Solo avisos de competencia activos. |
| Modelos | **Opción 3**: Gemma (clase 27B instruct) para **redactar y traducir** + Qwen2.5 instruct (7B–14B) con `--tool-call-parser hermes` para **extracción y agente/tool-calling**, ambos en **1 MI300X**. **Plan B (opción 1)**: Gemma 27B para todo. |
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
                              [Dev B] extractor LLM (Qwen, JSON guiado)
                                        │  Requirement[]  (con page + quote)
                                        ▼
 Ficha empresa (DB + Evolus library) ──► [Dev B] motor de reglas (código puro)
                                        │  ComplianceResult[] + score 0-100
                                        ▼
                    [Dev A] borrador de oferta (Gemma, idioma del pliego)
                                        │
                              Humano aprueba (nunca envía solo)
```

- Todo el LLM entra por **una interfaz OpenAI-compatible** con dos pares de variables, para poder cambiar de opción 3 a opción 1 solo con config:
  - `LLM_EXTRACT_BASE_URL`, `LLM_EXTRACT_MODEL`, `LLM_EXTRACT_API_KEY`
  - `LLM_DRAFT_BASE_URL`, `LLM_DRAFT_MODEL`, `LLM_DRAFT_API_KEY`
  - Si ambos pares apuntan al mismo servidor/modelo = plan B.
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

Dueño de: AMD + vLLM + cliente LLM + borrador + traducción + panel AMD + benchmark.

### A1. Droplet MI300X + vLLM (primera hora; bloquea al Dev B para pruebas reales)
1. Crear droplet MI300X en AMD Developer Cloud (cuenta con créditos ya lista). **Apagar/destruir cuando no se use**; anotar IP.
2. Aceptar la licencia de Gemma en Hugging Face y crear `HF_TOKEN`.
3. Levantar **en secuencia** (no simultáneo, el profiling de memoria puede chocar), con API key (`--api-key`, endpoint nunca abierto):
   ```bash
   # Orientativo: verificar imagen/versiones ROCm de vLLM al momento
   # 1) Gemma (~55% VRAM)
   vllm serve <gemma-27b-instruct> --host 0.0.0.0 --port 8000 \
     --api-key "$LLM_DRAFT_API_KEY" --gpu-memory-utilization 0.55 --max-model-len 16384
   # 2) Qwen (~25% VRAM), esperar a que Gemma esté arriba
   vllm serve Qwen/Qwen2.5-7B-Instruct --host 0.0.0.0 --port 8001 \
     --api-key "$LLM_EXTRACT_API_KEY" --gpu-memory-utilization 0.25 \
     --enable-auto-tool-choice --tool-call-parser hermes --max-model-len 32768
   ```
4. Guardar scripts en `infra/amd/` (`serve-gemma.sh`, `serve-qwen.sh`, `README`) para reproducir en 5 min.
5. **Puerta (≤2 h)**: ambos responden a `curl /v1/chat/completions`; Qwen pasa una prueba de **JSON guiado** (`response_format`/`guided_json`). Si no → **Plan B**: Gemma 27B sirve todo, Qwen se descarta, solo se cambia la config.
6. Pedir también acceso por red desde Dokploy (puertos 8000/8001 con key, idealmente limitando IP origen).

### A2. Cliente LLM y observabilidad
- `ai/llm.ts`: `chat({ role: "extract"|"draft", messages, schema?, signal })` sobre `fetch` OpenAI-compatible; timeout, 1 reintento, validación de JSON con `zod` (o similar).
- Medir por llamada: ms, tokens in/out, modelo. Guardar en tabla `ai_runs` (o log JSON) → alimenta el **panel AMD** (modelo, GPU, tokens/s, costo/min).
- Endpoint `GET /api/ai/health` que consulta `/v1/models` de ambos servidores (la demo muestra "AMD MI300X · Gemma + Qwen · ✔").

### A3. Borrador de oferta (Gemma)
- `ai/draft.ts`: entrada = `Requirement[]` + `ComplianceResult[]` + ficha empresa (+ proyectos de referencia) → salida = borrador estructurado (secciones: presentación, experiencia, plan de ejecución, cumplimiento de requisitos) **en el idioma del pliego** (demo: italiano).
- Reglas anti-alucinación: el prompt solo permite usar datos de la ficha; cada afirmación numérica se rellena **desde campos**, el LLM solo redacta alrededor. Marca "Generado con IA — revisar" en cada sección.
- Sin `status=FAILS` críticos no se genera (o se genera con advertencias visibles).
- Criterio de aceptación: borrador completo en < 60 s en la MI300X para el lote verde de la demo; tiempo medido y guardado.

### A4. Traducción + rerank (fase b/c)
- `ai/translate.ts`: traduce `description`/`quote` de requisitos a inglés/español/italiano para la matriz (Gemma). Cachear por hash.
- Dado que la búsqueda es **toda la UE**: detectar idioma del pliego y traducir para mostrar. Opcional: rerank de evidencia.

### A5. Benchmark (fase b)
- `scripts/benchmark.ts`: sobre el set etiquetado de Dev B, medir (1) precisión/recall de requisitos, (2) % de decisiones correctas de la matriz, (3) tiempo end-to-end por licitación, (4) tokens y costo estimado en la GPU. Salida a `docs/benchmark.md` con fecha y comando para reproducir.
- Comparar con la línea base "a mano ≈ 15 h" **solo como estimación declarada** (no medida).

## 4. Dev B — Entender el pliego, reglas, matriz, Evolus

Dueño de: parser, extractor, motor de reglas, score, set de evaluación, bloques Evolus.

### B1. Parser de pliegos por página
- `ai/pdf.ts`: PDF → `[{ page: number, text: string }]` (por ejemplo `pdfjs-dist` o `unpdf`; probar con los 3 PDFs de la demo). Si una página sale vacía (escaneo) → marcar `needsOcr`, y para el demo preferir PDFs con texto.
- Guardar resultado en `business_documents`-like para pliegos (nueva tabla `tender_documents`: url, hash, páginas JSON) y no reprocesar si el hash no cambió.
- Los pliegos salen de `document-url-lot`/links del aviso TED; para la demo, **PDFs locales fijados** en `fixtures/tenders/`.

### B2. Extractor de requisitos (Qwen)
- `ai/extract.ts`: por ventanas de páginas (p. ej. 6–8 páginas), prompt + **JSON schema** de `Requirement[]` (6 tipos). Fusionar y deduplicar; descartar items sin `page`+`quote`; verificar que `quote` aparezca realmente en el texto de esa página (comprobación determinista → mata alucinaciones).
- Normalizar umbrales (`€1.500.000` → `1500000`, `2%` → `0.02`, "90 giorni" → `90 days`).
- Prompts versionados en `ai/prompts/`.

### B3. Ficha de empresa → hechos
- Completar el perfil (hoy en DB pero sin UI): `cpvCodes`, `certifications`, `languages`, facturación anual (3 años), nº empleados, PyME sí/no, rango de contrato, proyectos de referencia (nombre, valor, año, cliente público). Coordinar con quien haga la UI del wizard.
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
Prioridad:
1. **Knowledge library** con la ficha de la empresa (documentos de certificados/proyectos). Subir con `POST /api/v1/memories/{LIBRARY_ID}/documents?language=it` (¡`language` explícito; por defecto es `it`!).
2. **Extractor** de documentos: schema de `Requirement[]`, llamado como **segunda opinión** del extractor propio (`.../json/{EXTRACTOR_ID}/ask-file`, con `?useWebhook=false`). Mostrar la comparación en el panel.
3. **Workflow diario TED** (disparador por horario) que llama a un endpoint nuestro o al TED y guarda resultados. *Activarlo: nacen en pausa (409 si no).*
4. **Agente**: chat sobre la ficha con modelo propio (BYOM → URL del vLLM + API key + test de conexión; requiere modelo con function calling → por eso Qwen/hermes).
- Claves **solo en variables de entorno**; el equipo de Evolus revisa uso de API y configuración del workspace, así que las llamadas deben quedar registradas (usar la REST API, no solo la UI).

## 5. Dependencias con el resto del equipo

- **TED**: `app/services/TED/fetch.ts` ya existe pero sin retry/paginación/dedupe y sin filtro de tipo de aviso. Quien haga la ingesta debe filtrar **solo avisos de competencia activos** (`cn-standard`, `cn-social`, `pin-cfc-standard`), pedir también `submission-url-lot`, `document-url-lot` y hacer fallback lote→procedimiento. Dev B consume el resultado, no lo reescribe.
- **DB**: `contracts` y `contract_matches` hoy son mínimas; necesitan CPV, valor, deadline, URLs y lotes. Acordar migración con el responsable de backend **antes** de que Dev B persista análisis. Mientras, `TenderAnalysis` puede guardarse como JSON en una tabla nueva `tender_analyses`.
- **UI**: lista de licitaciones (verde/rojo), detalle con matriz, panel AMD y botón "Aprobar". Deben leer `TenderAnalysis`.
- **Deploy (Dokploy)**: la app debe poder llamar a `LLM_*_BASE_URL`; el droplet debe aceptar la IP de Dokploy.

## 6. Seguridad y reglas de oro

- **Las llaves viven solo en `.env` / variables de Dokploy. Nunca en git, logs, capturas ni chat.** La `EU_API_KEY` de TED y la llave `rc-…` de Evolus ya circularon por chat: tratarlas como expuestas y rotar al terminar el hackathon (o ya si el chat es compartido).
- `.env` ya está ignorado por git; verificar con `git status` antes de cada commit. Añadir las variables nuevas a `.env.example` (sin valores).
- vLLM siempre con `--api-key`. Nada de endpoints abiertos.
- El agente **nunca envía** ofertas; solo propone, el humano aprueba. Etiquetar contenido generado por IA.
- No presentar métricas no medidas como medidas. El deck decía 92 %, 4'37'', 25 min: son metas hasta que `docs/benchmark.md` las respalde.

## 7. Cronograma sugerido (ajustar al reloj real; hora Venezuela)

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

## 8. Definition of Done (IA)

- [ ] Gemma sirve en vLLM sobre MI300X; panel AMD visible en la app.
- [ ] 3 pliegos demo → `Requirement[]` con página y cita verificable.
- [ ] Matriz determinista con los 6 tipos; tests de reglas pasan.
- [ ] 2 rojos y 1 verde coherentes con la empresa ficticia; score reproducible.
- [ ] Borrador en italiano generado en AMD, con aviso IA y aprobación humana.
- [ ] ≥2 bloques Evolus usados por REST con llaves en entorno.
- [ ] `docs/benchmark.md` con números medidos y comando para reproducir.
- [ ] Todo corre con `docker compose up` desde cero y en `garefacile.empovaro.com`.
