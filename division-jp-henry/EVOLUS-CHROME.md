# EVOLUS-CHROME — Guía operativa para automatización de navegador (Claude in Chrome)

> Portal: `https://app.evolus.ai` · Workspace del evento (NO plan Free) · Objetivo: configurar D1, D4, D5, D7, D9 y D11 (opcional) sin gastar créditos innecesarios. Sin secretos ni valores reales en esta guía.

## 0. Reglas de seguridad y ahorro (leer antes de tocar nada)

- **Anotar créditos y saldo al empezar y al terminar** (`Your company → Subscription & Credits → /company/billing`, pestaña `Usage`: tarjetas `Credits used`, `Operations`, `WALLET … credits available`; y `Home → /` métrica `credits available`). Captura ambas pantallas al inicio y al final.
- **Nunca reintentar en bucle (máximo 1 reintento manual y luego PARAR y reportar).**
- **Probar con 1 solo documento antes de subir más** (la indexación de bibliotecas y la lectura de documentos consumen créditos).
- **Extractor siempre con `useWebhook=false`** (respuesta síncrona en la llamada; con webhook los datos van al webhook y la llamada se encola).
- **Usar BYOM (modelo propio, no consume créditos)**. Las llamadas al modelo propio no consumen créditos Evolus; la indexación, extractores/OCR, AI Tools y bloques IA sobre modelo Evolus sí.
- **Un único chat de verificación por agente** (una sola pregunta de prueba por agente; no encadenar turnos salvo el `X-Conversation-Id` documentado).
- **Parar ante cualquier error, 402/429, aviso de créditos o pantalla inesperada.** 402 = créditos agotados o función no incluida en el plan; 429/rate-limit = más de 60 req/min por workspace; 409 = workflow apagado. PARAR y reportar, no reintentar en bucle.
- **Antes de crear, comprobar si el recurso ya existe (no duplicar):** revisar `/agents`, `/extractors`, `/automations`, `/company/libraries`, `/own-models` y `/company/api-keys` antes de pulsar Create/Generate.
- **No aceptar planes de pago, upgrades ni compras.** No pulsar `Try free for 14 days`, `Start the free trial`, `Change plan`, `Buy credits`, ni introducir tarjeta. El workspace de evento ya trae 50.000 créditos y modo BYOM.
- **No borrar nada** (bibliotecas solo se pueden borrar sin agentes; no borrar agentes, extractores, automatizaciones ni keys).
- **No disparar diálogos de alerta del navegador** (no usar atajos ni botones que abran `alert/confirm` del navegador; ante un diálogo inesperado, PARAR y reportar).
- Nunca escribir llaves, tokens, `applicationId` reales ni IP/keys de vLLM en el repo. Van solo en el reporte final privado y en `gara-facile/.env`.

## 1. Paso D1 — Acceso, API keys y SPACE ID (= EVOLUS_APP_ID)

**Ruta exacta:** `https://app.evolus.ai` → login en `identity.evolus.ai` (GitHub/Google/Apple/Microsoft o email+password) → entrar al workspace del evento (selector de workspace; nombre esperado según equipo) → `Your company → API keys → /company/api-keys`.
**Contexto previo (solo si aún no hay acceso):** el código del evento se canjea una sola vez por una persona del equipo (marca las Hackathon Conditions); el resto entra por invitación (hasta 6 personas). NO canjear dos veces ni crear otro workspace.

**Campos y valores:**
- `SPACE ID — The value to put in the X-Application-Id header` + botón `Copy` → este valor es `EVOLUS_APP_ID`.
- Botón verde `Generate` → crea una application API key nueva. **La llave completa solo se ve al crearla: copiarla en ese momento.**
- Fila existente (`Default API Key`, badge `Full access`, valor enmascarado `evo_...`): NO copiar su valor enmascarado; si ya existe una key válida del equipo, NO generar otra (no duplicar).

**Verificar que funcionó:** la nueva key aparece en la lista; `SPACE ID` copiado. Prueba de lectura fuera del navegador (sin imprimir la llave): `GET https://api.evolus.ai/api/v1/workflows` (lista, no gasta créditos) con headers `X-ApiKey + X-Application-Id` responde 200.

**Si falla:** si pide plan/upgrade o muestra `API_ACCESS / plan.feature_not_included` → PARAR (estás en plan Free, no en el workspace del evento). Si 429 → esperar y 1 solo reintento. Si la key no se copió a tiempo → generar una nueva (la anterior queda enmascarada) y anotarlo como incidencia.

**Anotar (privado, fuera del repo):** `EVOLUS_API_KEY`, `EVOLUS_APP_ID` (= SPACE ID). Luego un humano los pone en `gara-facile/.env` (nunca `NEXT_PUBLIC_*`).

## 2. Paso D4 — Biblioteca de conocimiento (EVOLUS_LIBRARY_ID)

**Ruta exacta:** `Your company → Document libraries → /company/libraries` → botón `Create new library`.
**Antes de crear:** comprobar que no exista ya `Gara Facile — Company KB` (ni una biblioteca equivalente del equipo). Si existe, usarla y anotar su ID; no duplicar.

**Campos y valores:**
- Nombre sugerido: `Gara Facile — Company KB`.
- Idioma de subida: **`it`** (los documentos de la demo son italianos; el valor por defecto de la API es `it`, así que para italiano no hace falta cambiar nada; para otros idiomas usar `?language=en|es` explícito).
- `PDF READING`: NO CONFIRMADO EN DOCS: verificar en pantalla (opciones vistas: `Let Evolus decide` por defecto; `Azure Document Intelligence (layout)` 10 cr/página; `Document text only`; `GreenPT Documents`). Para ahorrar: dejar `Let Evolus decide` salvo que el equipo indique otra cosa.
- Subida inicial: 1 solo documento de prueba (ficha de empresa o 1 pliego corto). Botones `Upload a document` / `From web page` (esta última lee solo esa página, sin crawling).

**Verificar que funcionó:** la biblioteca aparece con `DOCUMENTS (1)`; por API `GET /api/v1/memories/{libraryId}/documents` lista el documento; el estado de indexación pasa a buscable (la indexación corre en segundo plano tras `201 Created`). Captura para `docs/evolus.md`.

**Si falla:** si subir documento exige plan Starter → PARAR (estás en workspace equivocado). Si 402 → créditos agotados → PARAR. Si el documento no se indexa → esperar, 1 reintento de consulta de estado, luego PARAR y reportar. Anotar `EVOLUS_LIBRARY_ID` (visible en la URL de red `memories/{libraryId}` o en la página de la biblioteca).

## 3. Paso D5 — BYOM: conectar el modelo propio (`/own-models`)

**Ruta exacta:** `Your AI team → Your models → https://app.evolus.ai/own-models` → botón `+ Connect your own server` (NO `Connect a key`).
**Antes de crear:** comprobar que no haya ya una conexión vLLM del equipo. Si existe y su Test está en verde, usarla; no duplicar.

**Wizard (4 pasos) — campos y valores:**
1. `Step 1 of 4: Pick the provider` → elegir radio **`OpenAI-compatible (vLLM on AMD, ...)`** (`Your own server with the OpenAI API`). → `Next`.
2. `Step 2 of 4: How to reach your models` → `CONNECTION NAME`: nombre del equipo (p. ej. `vLLM AMD MI300X`; NO CONFIRMADO EN DOCS: verificar en pantalla si hay restricción de caracteres) → `ADDRESS (BASE URL)`: `http://<ip-droplet>:8001/v1` (la IP y el puerto los da JP; el puerto 8001 es el del brief, distinto del 8000 de los ejemplos públicos) → `API KEY (OPTIONAL)`: la key de vLLM (la da JP; obligatoria si vLLM arrancó con `--api-key`). Aviso `Plain HTTP address` esperado: normal para pruebas. → `Next`.
3. `Step 3 of 4: Pick the models to add` → el portal intenta leer `/v1/models`; si el servidor no lista modelos, usar `ADD AN ID BY HAND` con el id exacto del modelo servido (lo da JP) → `Add` → queda `1 picked`. → `Next`.
4. `Step 4 of 4: Test and save` → pulsar **`Test connection`** (comprueba: short answer, tool-call, streamed answer y reasoning si aplica; tarda hasta ~2 min). Solo cuando el test esté en verde → **`Save`**. Si el test falla (`The model doesn't answer` + `Answers/Tools/Streamed not tested`) → revisar dirección/key/id con JP, 1 solo `Test again`, luego PARAR. **Nunca `Save anyway` con un test en rojo.**

**Verificar que funcionó:** conexión guardada y visible en `/own-models`; el modelo aparece bajo `Your models` al crear agentes/extractores/bloques IA. **Captura del Test en verde para `docs/evolus.md`.**

**Si falla:** `I couldn't read the models…` en paso 3 = servidor inalcanzable → PARAR y pedir a JP que verifique que vLLM está levantado y reachable desde internet. No guardar conexiones de prueba.

## 4. Paso D7 — Agente + 1 pregunta de verificación (EVOLUS_AGENT_ID)

**Requisito previo:** modelo BYOM conectado (si aparece `Connect your model first`, volver a D5; el botón `Create the agent ✓` queda deshabilitado sin modelo).
**Ruta exacta:** `Your AI team → Agents → /agents` → `+ Create agent` (o `Create your first agent`) → `/agents/new`.

**Antes de crear:** comprobar en `/agents` que no exista ya el agente del equipo. Si existe, usarlo; no duplicar.

**Campos y valores (paso 1 → paso 2 `Refine and create`):**
- Vía recomendada: **`I'd rather start from scratch →`** (las plantillas de rol — Receptionist, Customer support, Quotes, FAQ, Bookings, Sales — rellenan en local sin gastar; la vía `Describe it to Evo ✨` consume IA: NO usarla).
- `WHAT'S ITS NAME?` (requerido): NO CONFIRMADO EN DOCS: verificar en pantalla (nombre exacto libre; sugerido `Gara Facile Assistant`).
- `WHAT DOES IT HANDLE (ONE SENTENCE)?`: frase corta (p. ej. `Risponde su azienda e gare usando la knowledge base`).
- `WHAT SHOULD IT DO AND HOW SHOULD IT BEHAVE?` (instrucciones, `INSTRUCTIONS`): pegar un texto que incluya: responde sobre la empresa y la licitación usando la biblioteca conectada, cita siempre la fuente, y **NUNCA decide elegibilidad** (eso lo dice la matriz de análisis). Idioma de trabajo: italiano.
- Modelo: seleccionar el modelo BYOM de D5 (aparece arriba bajo `Your models`). NO CONFIRMADO EN DOCS: verificar en pantalla — el formulario inicial de `/agents/new` no expone modelo ni bibliotecas; esas opciones aparecen en la página del agente tras crearlo. Conectar allí el modelo BYOM y adjuntar la biblioteca `Gara Facile — Company KB`.
- → `Create the agent ✓`.

**Verificar que funcionó (1 sola pregunta, en `/chat`):** elegir el agente a la izquierda (`Who do you want to talk to?`) y enviar exactamente: `Abbiamo la certificazione ISO 27001?` Debe responder con el dato de la biblioteca (la demo: ISO 9001 vigente, SIN ISO 27001) citando la fuente. NO seguir conversando. Anotar `EVOLUS_AGENT_ID`. Captura para `docs/evolus.md`.

**Si falla:** si el agente responde sin usar la biblioteca → revisar en su página que la biblioteca esté adjunta (1 ajuste, luego PARAR si sigue fallando). Cualquier 402/429 → PARAR.

## 5. Paso D9 — Extractor + schema equivalente a Requirement (EVOLUS_EXTRACTOR_ID)

**Requisito previo:** modelo BYOM conectado (sin él, `Create extractor` queda deshabilitado con `Connect your model first`).
**Ruta exacta:** `Your AI team → Data extractors → /extractors` → `+ Create extractor` → `/extractors/new`.
**Antes de crear:** comprobar que no exista ya el extractor del equipo. Si existe, usarlo; no duplicar.

**Campos y valores (alta, 1 paso):**
- `WHAT'S ITS NAME?` (requerido): NO CONFIRMADO EN DOCS: verificar en pantalla (sugerido `Gara Facile — Requirements`).
- `WHAT DOES IT HANDLE? (OPTIONAL)`: p. ej. `Reads tender PDFs and pulls out the 6 requirement types with page and quote`.
- → `Create extractor`. Pie: `Evolus picks the engine for you`.
- **Schema (en la página del extractor tras crearlo):** NO CONFIRMADO EN DOCS: verificar en pantalla (la guía de portal indica que el schema se define "right after, on its page", no accesible sin crear). Definir un objeto/lista equivalente a `Requirement` con estos campos por ítem:
  - `kind`: enum de 6 valores: `certification | min_turnover | bid_guarantee | similar_projects | execution_deadline | submission_deadline`
  - `description` (text), `value` (text/number según campo), `unit` (text, opcional), `page` (number), `quote` (text: cita literal), `confidence` (number 0–1)
  - Salida: **JSON** (en la ruta API usar `json`; `csv`/`text` solo si el extractor se define con esas salidas).
- Webhook: NO CONFIRMADO EN DOCS: verificar en pantalla (dejar sin webhook o desactivado; por API llamar siempre con `?useWebhook=false`).

**Verificar que funcionó:** extractor visible en `/extractors`; anotar `EVOLUS_EXTRACTOR_ID`. Probar por API con 1 solo PDF corto: `POST /api/v1/agents/{agentId}/json/{extractorId}/ask-file?useWebhook=false` (multipart `file=@...`) → respuesta JSON con los campos del schema + headers `X-AskFile-Execution-Id` / `X-AskFile-Audit-Id`. Captura para `docs/evolus.md`.

**Si falla:** 402 (OCR consume créditos) → PARAR. Bloque `Call a data extractor` en automatizaciones exige al menos 1 extractor: crearlo primero en esta sección.

## 6. Paso D11 (opcional) — Workflow con disparador por horario

**Ruta exacta:** `Your AI team → Automations → /automations` → `+ New automation` → detalle `/automations/<AUTOMATION_ID>`, pestaña `When it starts`.
**Antes de crear:** comprobar que no exista ya el workflow TED diario. Si existe, usarlo; no duplicar.

**Campos y valores:**
- `When it starts` → `On a schedule` → botón `Schedule` → frecuencia diaria + zona horaria (NO CONFIRMADO EN DOCS: verificar en pantalla los campos exactos de hora/zona). Texto literal: `The automation starts on its own at the frequency you choose (minimum every 30 seconds)… Every scheduled run consumes credits like any other.`
- `Execution parameters`: solo valores no sensibles (p. ej. idioma, destinatario). **Nunca poner secretos en `parameters`** (se guardan en claro y se muestran en el historial).
- Bloques mínimos sugeridos (receta sin IA si solo se prueba el andamiaje): `Start` → `Run a script` (0 créditos) → `Automation output` (exactamente uno por flujo). Los bloques `Ask an agent` / `Call a data extractor` exigen que el agente/extractor ya existan.
- **El workflow nace pausado (`Paused`):** para que responda por API hay que pasarlo a **`Active`** con el interruptor superior + **`Save changes`**. Sin activar responde **409 Conflict**. Se puede probar en `Try it` aun pausado, pero `Try it → Run it` gasta créditos: NO pulsarlo salvo orden expresa.

**Verificar que funcionó:** estado `Active`, guardado; `How it went` muestra `No executions (yet)` hasta el primer run programado. Anotar `EVOLUS_WORKFLOW_ID`. NO forzar ejecuciones para no gastar créditos.

**Si falla:** 409 → activar y guardar. Cualquier aviso de créditos → PARAR.

## 7. Verificación final — estadísticas API y capturas para docs/evolus.md

**Dónde ver las estadísticas de llamadas a la API (el jurado las revisa):**
- `Home → /`: tarjetas `chat conversations`, `in your AI team`, más `Recent activity` (`When your agents start working, you'll see it here`).
- `Your company → Subscription & Credits → /company/billing`, pestaña **`Usage`**: `Every credit: who uses it, where and why` + tarjetas `Credits used`, `Daily pace`, `Operations`, `People served`, desgloses `Who / Channel / Model / Kind of work`, rango de fechas y `Export`. Es la evidencia de uso.
- `Your company → Conversations → /company/conversations`: archivo de chats del agente (filtros `SEARCH / FROM / TO / AGENT`).
- Detalle de cada automatización → pestaña `How it went`: entrada/salida por bloque y créditos por run.
- Referencia interactiva: `Your company → API documentation → /company/api-docs` (disponible en el workspace de evento; en plan Free daba 402).

**Capturas para `docs/evolus.md` (sin secretos):**
1. `/own-models`: conexión vLLM + Test en verde.
2. `/company/libraries`: biblioteca con su documento indexado.
3. `/agents`: agente creado (+ 1 respuesta de prueba con cita).
4. `/extractors`: extractor + schema visible.
5. `/company/billing` pestaña `Usage`: consumo antes/después.
6. `Home`: contadores tras la verificación.
En `docs/evolus.md` poner: qué bloques se usan, para qué, qué ruta de la app los llama, IDs (sin llaves) y ejemplos `curl`.

## 8. Plantilla del reporte final (guardar en `C:\Users\Usuario 1\Documents\Nextec\evolus ia\evolus-privado\`)

> El reporte final es PRIVADO (fuera del repo). Incluye llaves e IDs reales. No commitear.

```markdown
# Reporte Evolus — configuración portal (privado)
Fecha: YYYY-MM-DD · Operador: (humano/automatización) · Workspace: (nombre)
Créditos inicio: (Usage: Credits used / WALLET available + captura) · Créditos fin: (idem + captura)

## Credenciales (NO compartir)
- EVOLUS_API_KEY: (solo el día de creación, ver D1)
- EVOLUS_APP_ID (= SPACE ID): ...
- EVOLUS_LIBRARY_ID: ...
- EVOLUS_AGENT_ID: ...
- EVOLUS_EXTRACTOR_ID: ...
- EVOLUS_WORKFLOW_ID (D11, si aplica): ...
- vLLM BASE URL: http://<ip>:8001/v1 · modelo: ... (sin la API key de vLLM en claro salvo canal seguro)

## Tabla de pasos
| Paso | Resultado (OK/FALLO) | ID | Créditos antes → después | Capturas | Incidencias |
|---|---|---|---|---|---|
| D1 API keys + SPACE ID | | — | | | |
| D4 Biblioteca | | | | | |
| D5 BYOM + Test | | — | | | |
| D7 Agente + 1 pregunta | | | | | |
| D9 Extractor + ask-file 1 doc | | | | | |
| D11 Workflow horario (opc.) | | | | | |
| Verificación final | | — | | | |

## Incidencias (errores 402/409/429, pantallas inesperadas, reintentos)
- ...
```

*Fuentes usadas (copia local, fuera de git): `reports/evolus-src/04-developers/` (quickstart, resumen-api, bring-your-own-model, knowledge-libraries-api, extractors-api, agent-chat-openai, workflows-api, limites-creditos-errores) y `reports/evolus-src/99-fase-2-plataforma/` (mapa-portal, guia-crear-cuenta, pruebas-gratuitas, api-referencia-hallazgos, guias-portal: your-models, agents, agents-new-detalle, libraries, extractors, extractors-new-detalle, automations, automations-bloques-parametros, api-keys, billing, home, chat-conversations, openapi-descargado); contexto `division-jp-henry/HENRY.md` (D1, D4, D5, D7, D9, D11). Sin secretos leídos ni escritos.*
