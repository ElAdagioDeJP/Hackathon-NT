# Gara Facile — División IA + Evolus (JP y Henry)

> **Deadline duro: 18 oct, 10:00 AM (hora Venezuela, UTC-4).** Pitch 11:00 AM.
> **Congelar funciones: 18 oct, 04:00 AM VET.** Desde ahí solo se arreglan errores.
> Tareas de cada uno: [`JP.md`](JP.md) · [`HENRY.md`](HENRY.md). Contexto general del equipo: [`../TASKS.md`](../TASKS.md). Detalle técnico de IA: [`../AI_DEVELOPERS.md`](../AI_DEVELOPERS.md).
> Linear: equipo **Balanzo**, proyecto [**"Gara Facile — IA + Evolus"**](https://linear.app/nextec-plus/project/gara-facile-ia-evolus-7dcc6e31946b) (JP = *El Sincero*: BAL-92…100; Henry: BAL-101…111). Cada issue tiene sub-issues con los pasos.

## 1. Qué hacemos nosotros (y qué no)

Gara Facile ayuda a una PyME italiana a encontrar licitaciones públicas europeas (TED), leer el pliego, saber si cumple y preparar un borrador de oferta. A JP y a Henry les toca **todo lo que es IA y Evolus**, entregado como **servicios + rutas `/api/ai/*`** que el resto del equipo consume.

| SÍ es nuestro | NO es nuestro (lo hace el resto del equipo) |
|---|---|
| Servidor AMD MI300X con vLLM (Gemma + Qwen) | Pantallas (lista de licitaciones, matriz, panel AMD, botón Aprobar) |
| Cliente LLM, métricas y salud (`/api/ai/health`, `/api/ai/amd-stats`) | Ingesta de TED a la base de datos (paginar, filtrar, ampliar `contracts`) |
| PDF del pliego → texto por página → requisitos con página y cita | UI de los campos nuevos del perfil (CPV, certificaciones, facturación, proyectos) |
| Motor de reglas fijas (cumple / no cumple / falta documento) + score | Docker, deploy en Dokploy, README raíz, licencia, repo público |
| Borrador de oferta en italiano con Gemma | Video, slides, portada, envío en lablab |
| Bloques Evolus por API: biblioteca, extractor, agente (+ BYOM) | |
| Fixtures de demo (3 pliegos, empresa ficticia) y benchmark | |

**Regla de oro:** el LLM **nunca** decide si la empresa cumple. Eso lo deciden reglas en código. El LLM extrae, traduce y redacta.

## 2. Flujo y dueño de cada pieza

```
TED (backend) ──► contracts (DB)
                      │
 PDF del pliego ──► [JP] ai/pdf.ts ─ páginas [{page, text}]
                      │
                [JP] ai/extract.ts (Qwen en AMD) ──► Requirement[] (con page + quote)
                      │                     ▲
                      │       [Henry] extractor Evolus (segunda opinión)
                      ▼
 Perfil empresa ─► [Henry] ai/profileFacts.ts ─► CompanyFacts
                      │
                [JP] ai/rules.ts + ai/scoring.ts ─► TenderAnalysis (score, GO/NO_GO/REVIEW)
                      │
                [Henry] ai/draft.ts (Gemma en AMD) ─► borrador en italiano
                      │
                 Humano aprueba (nunca se envía solo)

 [Henry] Evolus: biblioteca (ficha empresa) + agente (chat sobre la licitación, modelo propio en AMD)
 [JP]    ai/llm.ts + tabla ai_runs ─► [Henry] /api/ai/amd-stats (datos del panel AMD)
```

Todo el código nuevo va en `gara-facile/app/services/ai/` y las rutas en `gara-facile/app/api/ai/`. No se toca `app/services/TED` ni `app/services/business` salvo para **leer** con lo que ya existe:
- Perfil: `getProfileService().get(token)` → `app/services/business/runtime.ts`, `profiles.ts:77`.
- Documentos: `getDocumentService().list(recordId)` / `.download(recordId, documentId)` → `app/services/files/runtime.ts`, `documents.ts:160,260`.
- Campos del perfil que existen en DB pero nadie usa todavía: `cpvCodes`, `certifications`, `languages`, `contextSummary` (`app/db/schema.ts:51-63`).

## 3. Contrato compartido (se congela en la primera hora)

Archivo: `gara-facile/app/services/ai/types.ts`. **Lo crea JP en la primera hora y Henry lo revisa.** Después de congelado, cualquier cambio se avisa al otro y al equipo de UI.

Contiene (forma completa en `../AI_DEVELOPERS.md` §2):
- `RequirementKind` (6 tipos), `Requirement` (con `page` y `quote` obligatorios).
- `ComplianceStatus`, `ComplianceResult`, `TenderAnalysis` (score 0–100, verdict, `generatedBy`).
- **Nuevo:** `CompanyFacts`: lo que las reglas y el borrador necesitan saber de la empresa:

```ts
export interface CompanyFacts {
  businessRecordId: number;
  name: string;
  country: string;
  city: string;
  offerings: string;
  cpvCodes: string[];
  certifications: { name: string; expiresAt?: string; hasDocument: boolean }[];
  languages: string[];
  annualTurnover: { year: number; amountEur: number }[];   // últimos 3 años
  employees?: number;
  isSme?: boolean;
  bidGuaranteeCapacityEur?: number;
  maxExecutionDays?: number;
  referenceProjects: { name: string; client: string; year: number; valueEur: number; isPublic: boolean }[];
}
```

## 4. Rutas `/api/ai/*` (lo que consume la UI)

| Ruta | Dueño | Devuelve |
|---|---|---|
| `GET /api/ai/health` | JP | Estado de los 2 servidores vLLM (modelo, ok, latencia) |
| `POST /api/ai/analyze` | JP | `TenderAnalysis` de una licitación + perfil |
| `POST /api/ai/draft` | Henry | Borrador de oferta (secciones) + `generatedBy` |
| `GET /api/ai/amd-stats` | Henry | Datos del panel AMD (GPU, modelo, tokens/s, latencia, nº llamadas) |
| `POST /api/ai/evolus/library/sync` | Henry | Sube la ficha y los documentos de la empresa a la biblioteca Evolus |
| `POST /api/ai/evolus/extract` | Henry | Requisitos según el extractor Evolus + comparación con el nuestro |
| `POST /api/ai/chat` | Henry | Respuesta del agente Evolus (con `conversationId`) |

## 5. Variables de entorno (solo en `.env` y en Dokploy, nunca en git)

```
# JP — servidores vLLM en AMD
LLM_EXTRACT_BASE_URL=   LLM_EXTRACT_MODEL=   LLM_EXTRACT_API_KEY=
LLM_DRAFT_BASE_URL=     LLM_DRAFT_MODEL=     LLM_DRAFT_API_KEY=
AMD_GPU_LABEL=AMD Instinct MI300X

# Henry — Evolus
EVOLUS_API_KEY=  EVOLUS_APP_ID=  EVOLUS_AGENT_ID=  EVOLUS_EXTRACTOR_ID=  EVOLUS_LIBRARY_ID=
```

Si los dos pares `LLM_*` apuntan al mismo servidor y modelo, se usa el **plan B** (Gemma para todo). Cada uno agrega sus variables a `gara-facile/.env.example` sin valores.

## 6. Entregas entre JP y Henry

| Qué | De → a | Cuándo | Para qué |
|---|---|---|---|
| `ai/types.ts` congelado | JP → Henry | T+1 h | Ambos programan contra la misma forma |
| URL + API key de vLLM (Gemma y Qwen) | JP → Henry | T+2 h (puerta de modelos) | BYOM en Evolus, borrador |
| `ai/llm.ts` (`chat({ role, messages, schema })`) | JP → Henry | T+2 h | El borrador usa el mismo cliente y queda medido |
| `ai/profileFacts.ts` + empresa demo | Henry → JP | T+2 h | Las reglas leen `CompanyFacts` |
| `Requirement[]` de los 3 pliegos demo | JP → Henry | T+4 h | Comparar con el extractor Evolus y alimentar el borrador |

Mientras llega algo, cada uno trabaja con datos falsos (mock) con la misma forma del contrato.

## 7. Qué necesitamos del resto del equipo

1. **Backend**: ingesta TED → `contracts` ampliada (CPV, valor, deadline, URLs de documentos, lotes). Mientras tanto usamos `fixtures/tenders/`.
2. **UI**: campos nuevos del perfil (CPV, certificaciones, facturación 3 años, empleados, PyME, proyectos de referencia). Mientras tanto `profileFacts.ts` usa la empresa demo.
3. **UI**: pantallas que leen nuestras rutas (§4).
4. **Deploy**: que Dokploy pueda llamar a los puertos de vLLM (8000/8001) y a `api.evolus.ai`. JP pasa la IP del droplet.

## 8. Cronograma (hora Venezuela)

| Bloque | JP | Henry | Puerta |
|---|---|---|---|
| T+0–1 h | Droplet MI300X + Gemma en vLLM; `types.ts` | Acceso Evolus + llaves; `evolus.ts`; `profileFacts.ts` + empresa demo | Contrato congelado |
| T+1–2 h | Qwen + prueba JSON; `llm.ts`; `/api/ai/health` | Biblioteca Evolus (sync de ficha y documentos) | **Puerta modelos** (ok → Gemma+Qwen; si no → plan B) |
| T+2–5 h | PDF por página, extracción, reglas + tests | BYOM en Evolus, borrador con Gemma, `/api/ai/draft` | Matriz correcta en los 3 pliegos |
| T+5–8 h | `/api/ai/analyze` + `tender_analyses` | Extractor + agente Evolus, `/api/ai/amd-stats` | ≥2 bloques Evolus llamados por API |
| T+8–11 h | Set etiquetado + benchmark | `docs/evolus.md` (evidencia) + ayuda a integrar con UI | Números medidos |
| **04:00 AM** | **Congelar** | **Congelar** | — |
| 04:00–09:30 | Apoyo a video/README/Docker | Apoyo a video/README/Docker | Prueba desde cero OK |

**Si algo falla en una puerta: recortar, no retrasar.** Orden de recorte: traducción → workflow Evolus → benchmark completo (dejar 1 medición) → extractor Evolus. **El piso es:** matriz + borrador + panel AMD + 2 bloques Evolus (biblioteca + agente).

## 9. Definition of Done (de los dos)

- [ ] Gemma (y Qwen o plan B) sirviendo en vLLM sobre MI300X, con `--api-key`.
- [ ] 3 pliegos demo → `Requirement[]` con página y cita verificada.
- [ ] Reglas de los 6 tipos con tests que pasan (`tsx --test`); 2 licitaciones en rojo y 1 en verde para la empresa demo.
- [ ] Borrador en italiano generado en AMD, con aviso "Generato con IA — da revisionare" y aprobación humana.
- [ ] Biblioteca + agente Evolus (y extractor si da tiempo) usados por REST; el agente usa nuestro modelo en AMD (BYOM).
- [ ] `/api/ai/*` documentadas y probadas con `curl`.
- [ ] Llaves solo en variables de entorno; `.env.example` actualizado.

## 10. Reglas para trabajar juntos

- Ramas: `ai/jp-*` y `ai/henry-*` → PR rápido a `main`. `main` siempre desplegable.
- Antes de cada commit: `git status` (que no entre `.env`) y `bun run lint`.
- Las llaves `EU_API_KEY` y `rc-…` de Evolus ya pasaron por chats: se rotan al terminar el hackathon.
- Solo se muestran números **medidos**. Nada de 92 % ni 4'37'' si no salen de `docs/benchmark.md`.
- Cualquier bloqueo de más de 20 min se avisa en el chat del equipo.
