# Prompt para la siguiente sesión (JP · Gara Facile · IA + Evolus)

> Pegar todo lo que está debajo de la línea en una conversación nueva de Claude Code abierta en `C:\Users\juanr\Documents\Github\Hackathon-NT-Private`.

---

Eres mi par de desarrollo para terminar **Gara Facile** en el hackathon AMD × lablab. Respondes en español, conciso. Yo soy JP ("El Sincero" en Linear). JP ("El Sincero" en Linear) se desconectó y me traspasó todo su bloque Evolus: ahora D1–D11 también son míos.

## 0. Antes de tocar nada (obligatorio, en este orden)

1. Lee `CLAUDE.md` (reglas del repo), `division-ai/GENERAL.md`, `division-ai/JP.md`, `division-ai/EVOLUS.md`, `HANDOFF-JP.md` y `gara-facile/AGENTS.md`.
2. **Git, todo el repo:**
   - `git fetch --all --prune` y lista ramas remotas (`origin/main`, `origin/docs/hackathon-plan`, `origin/ai/jp-core` y cualquier rama nueva).
   - Para cada rama con commits nuevos: `git log --oneline ai/jp-core..origin/<rama>` y `git show --stat` de cada commit. Resume qué cambió y quién.
   - Rebasea `ai/jp-core` sobre `origin/docs/hackathon-plan` (que ya contiene `main`). Resuelve conflictos **conservando ambos lados**. Conflictos típicos: `package.json` (scripts `test:*` duplicados), `.env.example` (bloques EVOLUS_* y LLM_*), `app/db/schema.ts`.
   - Si alguien reintroduce `_contract.mock.ts` o importa de ahí, cambia el import a `./types` y bórralo.
   - Después del rebase corre la suite (sección 6). No hagas push con tests rojos salvo el fallo conocido de Windows en `test:files`.
3. **Linear** (MCP `linear-server`, equipo **Balanzo**, proyecto **"Gara Facile — IA + Evolus"**): lista los issues del proyecto y compáralos con la tabla de la sección 3. Corrige los estados que no cuadren. Si el clasificador bloquea un `save_issue`, no insistas: anótalo y avísame.

## 1. Reglas que no se rompen

- **Commits sin `Co-Authored-By` ni "Generated with Claude Code"** (commits y PR). Está en `CLAUDE.md` del repo. Conventional Commits, `git add` con rutas explícitas.
- **Llaves solo en `gara-facile/.env`** (ignorado por git). Nunca en commits, logs, Linear, PRs ni en el chat. Antes de cada commit: `git status` y `git diff --cached | grep -E "rc-[0-9a-f]{40}|evo_"` debe salir vacío.
- **El LLM nunca decide elegibilidad.** Extrae y redacta; las reglas en `ai/rules.ts` deciden.
- **Solo números medidos** en docs y pitch (`docs/benchmark.md`). Nada de 92 % ni tiempos inventados.
- Este Next.js (16.4.2) es distinto: lee `gara-facile/node_modules/next/dist/docs/` antes de usar APIs de rutas/cache. Con `cacheComponents: true` **no** se puede `export const dynamic`; para forzar request-time usa `await connection()` de `next/server`.
- Modelos: **solo Gemma** (Google) para todo. Nada de Qwen/DeepSeek/GLM visibles (premio Google). `/api/ai/health` no debe exponer el catálogo del proveedor.

## 2. ⚠️ PILAS con las requests y las pruebas (cuotas compartidas)

- **AMD Token Factory**: una sola key de equipo (`rc-…`) para los 6 miembros. Límites **por key**: **20 RPM**, **8 concurrentes**, **$1/día** (reset 16:00 UTC = 12:00 VET). Gemma-4-31B-IT ≈ $0,035/M tokens de entrada. Un `analyze` de un pliego ≈ 6–8 llamadas y 35–60k tokens.
  - Antes y después de una tanda de pruebas: `curl -s "$LLM_DRAFT_BASE_URL/usage" -H "Authorization: Bearer $LLM_DRAFT_API_KEY"` y anota `daily_cost_used_usd`.
  - Pruebas en **secuencia**, nunca en paralelo ni en bucle. Ante 429 respeta `Retry-After` (el cliente ya lo hace con 1 reintento).
  - Los tests unitarios usan `fetch` falso: córrelos libremente. Las llamadas reales solo cuando hay que validar algo nuevo.
  - Reutiliza `fixtures/tenders/*.requirements.json` en vez de re-extraer si el prompt no cambió.
- **Evolus**: créditos del workspace `arepa-power` (≈49.998). Anota el saldo antes/después de cada cosa que gaste (indexar, extractor, IA de Evolus; BYOM no gasta). Máximo 1 reintento manual; ante **402/429/409 para**. Siempre `language=it` explícito. No crear recursos duplicados.
- **Healthcheck de Docker** usa `/` y no `/api/ai/health` precisamente para no gastar RPM.

## 3. Estado al cierre de la sesión anterior (verificar contra Linear y git)

Rama de trabajo: `ai/jp-core` → PR a `docs/hackathon-plan` → PR a `main` (privado). Otra persona lleva `main` privado al repo público del hackathon (`ElAdagioDeJP/Hackathon-NT`, PR #1 ya abierto con una importación anterior; allí "JP" está renombrado a "Henry").

| Issue | Qué | Estado | Evidencia |
|---|---|---|---|
| BAL-92 J1 | Inferencia AMD | Done (sin droplet) | Token Factory, Gemma-4-31B-IT; puerta pasada (chat, json_schema, 401 sin key). Droplet: cuenta sin créditos; scripts vLLM en `infra/amd/` como respaldo |
| BAL-115 J1.4 | Entregar URL/key | In Progress | Falta: pasar config a quien haga deploy por canal privado |
| BAL-93 J2 | `ai/types.ts` | Done | `profileFacts.ts` y `library.ts` importan `./types` |
| BAL-94 J3 | `llm.ts` + `ai_runs` + health | Done | 21 filas `ai_runs` ok en prueba real; health 200 |
| BAL-95 J4 | 3 pliegos + `pdf.ts` | Done | 691579 Frosinone, 629600 Fondimpresa, 687674 UNIVPM |
| BAL-96 J5 | `extract.ts` | Done | prompt `extract.v2` (solo requisitos de participación), 0 citas inventadas |
| BAL-97 J6 | reglas + score + tests | Done en código (Linear pudo quedar en Backlog: el clasificador bloqueó el cambio) | 2 rojos + 1 verde |
| BAL-98 J7 | `POST /api/ai/analyze` | Done | NO_GO 53 (58 s), NO_GO 13 (31 s), GO 100 (24 s) |
| BAL-99 J8 | etiquetas + benchmark | In Progress | `fixtures/eval/labels.json` (14 req.) hecho (BAL-134 pudo quedar en Backlog); **falta `scripts/benchmark.ts` + `docs/benchmark.md` (BAL-135)** |
| BAL-100 J9 | traducción | Backlog (P2) | |
| BAL-101..104 D1–D4 | llaves, cliente Evolus, profileFacts, biblioteca | Done (JP) | Biblioteca `Gara Facile — Company KB`, `EVOLUS_LIBRARY_ID` en `.env` |
| BAL-105 D5 | BYOM en Evolus | **Pendiente** | Ahora apunta a Token Factory, no a vLLM (ver 4.2) |
| BAL-106 D6 | borrador `ai/draft.ts` + `/api/ai/draft` | **Pendiente, siguiente** | Spec en `EVOLUS.md` D6 |
| BAL-107 D8 | `/api/ai/amd-stats` | Pendiente | Lee `ai_runs` (+ opcional `/v1/usage`) |
| BAL-110 D7 | agente Evolus + `/api/ai/chat` | Pendiente ⛓ D5 | `evolusChat()` ya existe en `ai/evolus.ts` |
| BAL-111 D9 | extractor Evolus | Pendiente (P1) | |
| BAL-108 D10 | `docs/evolus.md` | Pendiente | |
| BAL-109 D11 | workflow TED | Solo si sobra tiempo | |

Hechos técnicos ya decididos (no reabrir):
- `.env` de JP ya tiene: `LLM_*` → `https://developer.amd.com.cn/radeon/api/v1`, modelo `Gemma-4-31B-IT` para ambos roles, `AMD_GPU_LABEL=AMD Radeon Cloud · Token Factory`, `EVOLUS_API_KEY`, `EVOLUS_APP_ID`, `EVOLUS_LIBRARY_ID`.
- Empresa demo: `fixtures/company/demo-company.json` (Nordest Software, solo ISO 9001, `maxExecutionDays: 60` para que UNIVPM quede verde).
- Migraciones: `drizzle/` no se versiona. En local: `bun run db:generate && bun run db:migrate` (si una migración incremental falla, mueve `drizzle/` a `var/` y regenera). En Docker: `drizzle-kit push` al arrancar.

## 4. Plan de trabajo (en este orden; recortar, no retrasar)

Congelar funciones: **18 oct 04:00 VET**. Entrega: **18 oct 10:00 VET**. Pitch 11:00.

### 4.1 D6 · Borrador de oferta (BAL-106, BAL-151..153) — primero
- `app/services/ai/draft.ts`: entrada `TenderAnalysis` + `Requirement[]` + `CompanyFacts` (+ metadatos del fixture). Salida `{ status: "draft", language, sections: [{ key, title, body }], warnings, generatedBy }`.
- Secciones: presentazione dell'azienda, esperienza pertinente, piano di esecuzione, dichiarazione di conformità per requisito.
- Anti-alucinación: el prompt solo recibe un bloque de hechos (de `CompanyFacts`); la sección de conformidad se arma **determinísticamente** desde `results` (no la redacta el LLM). Después de generar, comprueba que todo número de ≥3 cifras del texto exista en los hechos; si no, añádelo a `warnings`.
- Cada sección termina con `Generato con IA — da revisionare`. Con algún `FAILS`: se genera igual con `warnings` arriba.
- `chat({ role: "draft", schema })` de `llm.ts` → queda medido en `ai_runs`.
- `POST /api/ai/draft { tenderId, businessRecordId? }`: usa el último `tender_analyses` del tender y los requisitos de `fixtures/tenders/<id>.requirements.json` (sin re-extraer). Errores: 404 sin análisis previo, 502 si el modelo falla.
- Tests con `chat` falso. Prueba real **una vez** en 687674 (verde): < 60 s.

### 4.2 D5 + D7 · BYOM y agente Evolus (BAL-105, 149, 150, 110, 154–156)
- Portal Evolus (Claude in Chrome; yo inicio sesión): `/own-models` → Connect your own server → OpenAI-compatible → base URL de Token Factory + key de equipo → **Test connection en verde** → Save (nunca "Save anyway"). Requiere modelo con tool calling: probar Gemma-4-31B-IT; si Evolus exige otro, avísame antes de elegir uno chino.
- Agente "from scratch" con el modelo BYOM + biblioteca D4; instrucciones: responde sobre la empresa y la licitación, cita la fuente, **nunca decide elegibilidad**. Guarda `EVOLUS_AGENT_ID` en `.env`.
- `POST /api/ai/chat { message, conversationId? }` → `evolusChat()`. Prueba: "Abbiamo la ISO 27001?" (respuesta esperada: no).

### 4.3 D8 · `GET /api/ai/amd-stats` (BAL-107, 157, 158)
- Agregados de `ai_runs` (llamadas, ok/errores, tokens in/out, ms p50/p95, tokens/s por modelo, últimas N) + `AMD_GPU_LABEL`. Opcional: `/v1/usage` del proveedor con cache corta (no llamar en cada request). Ejemplo de respuesta para UI.

### 4.4 J8 · Benchmark (BAL-135)
- `scripts/benchmark.ts`: compara `*.requirements.json` contra `fixtures/eval/labels.json` (precisión/recall por kind + página), % de decisiones correctas de la matriz, tiempo por licitación y tokens/s desde `ai_runs`. Salida `docs/benchmark.md` con fecha, modelo, prompt y comando. Una sola corrida real.

### 4.5 D10 · `docs/evolus.md` (BAL-108) + D9 extractor Evolus (BAL-111) si hay tiempo
### 4.6 J9 traducción y D11 workflow: solo si sobra tiempo.

## 5. Deploy: Dokploy + Docker Compose

Ya existen y están probados en local (build OK, `analyze` GO 100 en 61 s dentro del contenedor, estado `healthy`) en `gara-facile/`: `Dockerfile` (Node 22, bun solo para instalar, `next build`, usuario `node`), `docker-compose.yml` (volúmenes `gara-data` → `/app/data` y `gara-uploads` → `/app/var/uploads`, `env_file: .env` opcional, healthcheck en `/`), `.dockerignore`, `scripts/docker-start.sh` (`drizzle-kit push` + `next start`) y `.gitattributes` en la raíz (`*.sh` con LF).

- Local: `cd gara-facile && APP_PORT=3100 docker compose up --build -d` → `curl localhost:3100/` (200) → `curl localhost:3100/api/ai/health` (una vez) → `docker compose down`.
- Dokploy (`garefacile.empovaro.com`): servicio **Compose** apuntando al repo/rama y a `gara-facile/docker-compose.yml`. Variables en la pestaña Environment (las de `.env.example` con valores reales). Dominio → servicio `app`, puerto **3000**. Volúmenes persistentes. Verifica desde el contenedor que llega a `developer.amd.com.cn` y `api.evolus.ai` (`docker exec … node -e "fetch(...)"`).
- `drizzle-kit push` no destruye datos: si un cambio de esquema necesita borrar algo, el arranque se detiene. Avísame en vez de forzar.

## 6. Verificación antes de cada push

```
cd gara-facile
bun run test:ai && bun run test:match && bun run test:profiles && bun run test:files
bun run lint
bunx tsc --noEmit -p .   # debe salir limpio; next build falla con cualquier error de tipos (incluidos tests)
```
`test:files` falla en Windows solo por permisos de symlink (EPERM); en Linux/Docker pasa.

## 7. Flujo de ramas y PRs

1. Push `ai/jp-core` (`git push -u origin ai/jp-core`; si fue rebaseada, `--force-with-lease`).
2. PR `ai/jp-core` → `docs/hackathon-plan` con `gh` (`C:\Program Files\GitHub CLI\gh.exe`, ya autenticado como ElAdagioDeJP). Cuerpo: resumen + plan de pruebas, **sin** línea de Claude.
3. PR `docs/hackathon-plan` → `main` (privado).
4. El paso a `ElAdagioDeJP/Hackathon-NT` (público) lo hace otra persona.
5. Actualiza en Linear cada issue que cierres con un comentario corto de evidencia (commit, tiempos, `curl`).

Empieza por la sección 0 y muéstrame el resumen de git + Linear antes de escribir código.
