# Henry — Integración Evolus, borrador de oferta y datos del panel AMD

> Linear: asignado a **Henry** · equipo Balanzo · proyecto "Gara Facile — IA + Evolus".
> Visión común, contrato, rutas y cronograma: [`GENERAL.md`](GENERAL.md). Detalle técnico extendido: [`../AI_DEVELOPERS.md`](../AI_DEVELOPERS.md) §3 A3 y §4 B6.
> Congelar funciones: **18 oct 04:00 AM VET**.

**Responsabilidad:** que Gara Facile use Evolus de verdad por API (es lo que revisa el jurado de Evolus), que el borrador de oferta salga de Gemma en AMD y que el panel AMD tenga datos reales. Todo lo de esta lista es tuyo de punta a punta: código, configuración del workspace y prueba con `curl`.

**Recibes de JP** (ver `GENERAL.md` §6): `types.ts` (T+1 h), URL + key de vLLM y `llm.ts` (T+2 h), `Requirement[]` de los 3 pliegos (T+4 h). **Entregas a JP:** `profileFacts.ts` + empresa demo (T+2 h).
Las tareas marcadas ⛓ dependen de JP. Mientras tanto, cada una dice qué adelantar.

## Datos de Evolus que vas a usar

- Base REST: `https://api.evolus.ai/api/v1` · headers `X-ApiKey: <EVOLUS_API_KEY>` + `X-Application-Id: <EVOLUS_APP_ID>`.
- Chat del agente (OpenAI-compatible): `https://api.evolus.ai/v1/chat/completions` · `Authorization: Bearer <EVOLUS_API_KEY>` (sin `X-Application-Id`) · `model: "<EVOLUS_APP_ID>:<EVOLUS_AGENT_ID>"` · seguir la conversación con el header `X-Conversation-Id` · contenido solo texto · `temperature` no aplica (la define el agente).
- Requisitos del track Evolus: workspace del evento · **agente principal con modelo propio en AMD vía vLLM (BYOM)** · ≥2 bloques · uso por API desde la app · llaves solo en variables de entorno. **El jurado revisa la configuración del workspace y las estadísticas de llamadas a la API.**
- Evolus **no deja crear agentes ni extractores sin un modelo conectado** ("Connect your model first").
- Referencia local: `evolus doc/04-developers/` (`resumen-api.md`, `knowledge-libraries-api.md`, `extractors-api.md`, `agent-chat-openai.md`, `bring-your-own-model.md`, `limites-creditos-errores.md`) y `evolus doc/99-fase-2-plataforma/`.

---

## P0 — Imprescindible para entregar

### D1 · Acceso a Evolus y llaves — *Urgent* (T+0)
- Entrar al workspace del evento (ya creado) en `app.evolus.ai`. Si no tienes acceso, pedir invitación a quien canjeó el código.
- API keys → **Generate** (la llave completa solo se ve al crearla). Copiar `SPACE ID` = `EVOLUS_APP_ID`.
- Guardar en `.env` y agregar a `.env.example` sin valores: `EVOLUS_API_KEY`, `EVOLUS_APP_ID`, `EVOLUS_AGENT_ID`, `EVOLUS_EXTRACTOR_ID`, `EVOLUS_LIBRARY_ID`.
- **Hecho cuando:** `curl` con los headers a un endpoint de lectura (p. ej. listar bibliotecas) responde 200.

### D2 · Cliente Evolus `app/services/ai/evolus.ts` — *Urgent*
- Funciones pequeñas sobre `fetch`: `evolusRequest(path, init)` con headers, timeout (30 s) y error claro (status + cuerpo), más `evolusChat(messages, conversationId?)` para el endpoint OpenAI-compatible.
- Registrar cada llamada (ruta, status, ms) en consola/log JSON: es la evidencia de uso de la API.
- Las llaves solo se leen en servidor. Nunca `NEXT_PUBLIC_*`.
- **Hecho cuando:** una prueba (`tsx --test`, sin red: `fetch` falso) verifica headers y manejo de error.

### D3 · Hechos de empresa `app/services/ai/profileFacts.ts` + empresa demo — *Urgent* (entrega a JP en T+2 h)
- `getCompanyFacts(businessRecordId?): Promise<CompanyFacts>` (tipo en `types.ts`, ver `GENERAL.md` §3).
- Lee el perfil con `getProfileService()` (`app/services/business/runtime.ts`) y los documentos con `getDocumentService().list()` (`app/services/files/documents.ts:160`). `hasDocument` = existe un documento subido para esa certificación.
- Los campos que la UI todavía no llena (facturación, proyectos, etc.) salen de la **empresa demo**: `fixtures/company/demo-company.json`, una PyME italiana de software (p. ej. "Nordest Software S.r.l.", Padova). Tiene ISO 9001 vigente y **sin** ISO 27001, facturación de 3 años, 2–3 proyectos públicos de referencia y capacidad de garantía. Debe ser coherente con los 3 pliegos de JP para que salgan **2 en rojo y 1 en verde**. No usar "SOA OS30".
- **Hecho cuando:** JP puede importar `getCompanyFacts()` y obtener la empresa demo sin base de datos.

### D4 · Bloque Evolus 1: Biblioteca de conocimiento — *Urgent*
- Crear la biblioteca en el workspace y guardar el ID en `EVOLUS_LIBRARY_ID`.
- `POST /api/ai/evolus/library/sync` `{ businessRecordId? }`: sube una ficha en texto de `CompanyFacts` y los documentos del perfil con `POST /api/v1/memories/{LIBRARY_ID}/documents?language=it`. **Siempre `language` explícito.** No volver a subir lo que no cambió (hash).
- **Hecho cuando:** los documentos aparecen indexados en el portal y la ruta responde con la lista subida.

### D5 · BYOM: conectar nuestro modelo en AMD a Evolus — *Urgent* ⛓ J1
- Portal → `/own-models` → `OpenAI-compatible` → `BASE URL` = `http://<ip-droplet>:8001/v1` (Qwen, por function calling; en plan B, el de Gemma) + `API KEY` = key de vLLM → elegir modelo → **Test connection** (respuesta, tool-call, streaming) → Save.
- *Mientras JP levanta vLLM:* adelantar D3, D4, D8 con mock y el prompt del agente (D7).
- **Hecho cuando:** el test de conexión pasa en verde. Captura de pantalla para `docs/evolus.md`.

### D6 · Borrador de oferta `app/services/ai/draft.ts` + `POST /api/ai/draft` — *Urgent* ⛓ J3
- Entrada: `TenderAnalysis` + `Requirement[]` + `CompanyFacts`. Salida: `{ sections: [{ title, body }], language, generatedBy: { model, ms, tokens } }`.
- Secciones: presentación de la empresa, experiencia relevante, plan de ejecución y declaración de cumplimiento por requisito.
- Llama a `chat({ role: "draft", ... })` de `llm.ts` (Gemma en AMD), así queda medido en `ai_runs`.
- **Anti-alucinación:** el prompt solo usa datos de `CompanyFacts`; cifras, fechas y nombres se insertan desde campos y el modelo solo redacta alrededor. Cada sección termina con "Generato con IA — da revisionare".
- Idioma del pliego (demo: italiano). Con algún `FAILS` se genera igual, pero con advertencias visibles arriba.
- Devuelve `status: "draft"`. **Nunca se envía solo**: el botón Aprobar es de la UI.
- *Mientras llega `llm.ts`:* armar el prompt y la estructura con una respuesta mock.
- **Hecho cuando:** el borrador para la licitación en verde sale en **< 60 s** en MI300X y el tiempo queda en `ai_runs`.

### D7 · Bloque Evolus 2: Agente + `POST /api/ai/chat` — *Urgent* ⛓ D5
- Crear el agente en el workspace con **nuestro modelo (BYOM)**, conectado a la biblioteca de D4. Instrucciones: responde sobre la empresa y la licitación, cita la fuente y **nunca** decide elegibilidad (eso lo dice la matriz).
- Guardar `EVOLUS_AGENT_ID`.
- `POST /api/ai/chat` `{ message, conversationId? }` → `evolusChat()` → `{ answer, conversationId }`.
- **Hecho cuando:** "¿Tenemos ISO 27001?" responde con el dato de la biblioteca, y la llamada aparece en las estadísticas del workspace.

### D8 · Datos del panel AMD `GET /api/ai/amd-stats` — *Urgent* ⛓ J3
- Lee `ai_runs` (tabla de JP) y devuelve `{ gpu: AMD_GPU_LABEL, models: [{ role, model }], last: { ms, tokensPerSecond }, totals: { calls, tokens }, avgMsByRole }`.
- Combina con `/api/ai/health` de JP si la UI quiere una sola llamada.
- **Hecho cuando:** después de un análisis y un borrador, el endpoint muestra números reales.

## P1 — Suma puntos

### D9 · Bloque Evolus 3: Extractor (segunda opinión) + `POST /api/ai/evolus/extract` — *High* ⛓ D5, J5
- Crear el extractor con un schema equivalente a `Requirement[]` (6 tipos, página y cita). Guardar `EVOLUS_EXTRACTOR_ID`.
- Llamar `.../json/{EXTRACTOR_ID}/ask-file?useWebhook=false` con el PDF del pliego.
- Comparar con el resultado de JP: `{ ours: n, evolus: n, matched, onlyOurs, onlyEvolus }`.
- **Hecho cuando:** devuelve la comparación para los 3 pliegos demo.

### D10 · Evidencia para el jurado `docs/evolus.md` — *High*
- Qué bloques se usan, para qué, qué ruta de la app los llama, IDs (sin llaves), capturas del workspace (modelo BYOM, biblioteca, agente, extractor) y ejemplos de `curl`.
- Texto corto para la descripción de lablab: "Evolus: knowledge library + agent (BYOM, Qwen/Gemma on AMD MI300X via vLLM) + extractor, all called via REST from Gara Facile".
- **Hecho cuando:** quien haga el envío en lablab puede copiar de aquí.

## P2 — Si sobra tiempo

### D11 · Bloque Evolus 4: Workflow diario TED — *Medium*
- Workflow con disparador por horario que llama a un endpoint nuestro (o a TED) y guarda las licitaciones nuevas. **Activarlo** (nace pausado; si no, responde 409). Nunca poner secretos en `parameters`.

---

## Checklist rápido
- [ ] D1 llaves · [ ] D2 cliente · [ ] D3 `profileFacts` + empresa demo (→ JP)
- [ ] D4 biblioteca · [ ] D5 BYOM ⛓ · [ ] D6 borrador ⛓ · [ ] D7 agente ⛓ · [ ] D8 amd-stats ⛓
- [ ] D9 extractor · [ ] D10 `docs/evolus.md` · [ ] D11 workflow
