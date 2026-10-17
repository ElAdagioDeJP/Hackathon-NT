# Gara Facile — Tareas para terminar y ganar (AMD Hackathon ACT III)

Generado el 2026-10-17 a partir de: análisis del repo (3 agentes), `GaraFacile_Idea_ES.pdf`, `GaraFacile_PitchDeck_ES.pdf`, `5_Ideas_AMD_Hackathon_ACT_III.pdf`, la conversación de Gemini sobre la API de TED y la página oficial del hackathon.

## 0. Realidad del reloj

- **Cierre de entregas: 18 oct, 10:00 AM (hora Venezuela, UTC-4)** = 16:00 en Italia (CEST). Pitch en vivo: 11:00 AM VET.
- Hoy es 17 oct. Quedan menos de ~24 h. Todo lo de abajo está ordenado por prioridad: **P0 = sin esto no se puede entregar / descalifica**, P1 = lo que gana puntos, P2 = si sobra tiempo.
- Originalidad: los commits del repo son del 14–16 oct (posteriores al kickoff del 12 oct). OK.

## 1. Qué exige el hackathon (requisitos duros)

| Requisito | Estado hoy |
|---|---|
| Parte importante del workload corre en **AMD** (Developer Cloud / MI300X / ROCm) y **se ve en la demo** | ❌ no existe nada |
| Modelo abierto (Gemma) servido en **vLLM propio** en AMD (también requisito del premio Evolus) | ❌ |
| Producto funcionando (no solo slides/dashboard) | 🟡 solo formulario de perfil de empresa |
| Repo **público**, licencia **MIT**, README que corre | ❌ repo privado, sin LICENSE, sin README raíz |
| App en **Docker**, llaves en variables de entorno | ❌ sin Dockerfile |
| **URL de la app en línea** | ❌ sin deploy |
| Video demo + slides + imagen de portada | ❌ |
| Título, descripción corta y larga, tags en lablab | ❌ |
| Evolus: ≥2 bloques Evolus (workflow, extractor, AI tool, knowledge library, MCP, sub-agente, widget) + integración REST API | ❌ |
| Inscrito en lablab, Discord, AMD AI Developer Program | ❓ confirmar |
| Comercio: el LLM no puede ser el único método de predicción | ✅ por diseño (reglas fijas) |

Criterios de jurado: Aplicación de la tecnología, Presentación, Valor de negocio, Originalidad (+ revisan config del workspace Evolus y uso de API).

## 2. Qué existe en el repo (resumen)

- Next 16 / React 19 / Tailwind 4 / Drizzle + SQLite (better-sqlite3), Bun.
- Wizard de 4 pasos de perfil de empresa (en inglés), borradores, cookie de sesión anónima, subida de PDF/DOC/DOCX (local o S3) con validación sólida, tests de perfiles y archivos.
- Cliente TED (`app/services/TED/fetch.ts`): correcto en forma, **sin ningún caller**, sin reintentos/timeout/paginación/validación. Pide ya casi todos los campos útiles de la lista de Gemini.
- **No existe**: lista de licitaciones, matching/scoring, lectura de pliegos, matriz de cumplimiento, borrador de oferta, nada de IA, nada de AMD, nada de Evolus, landing, Docker, CI, deploy.

## 3. Tareas

### P0 — Mínimo entregable (hacer en este orden)

1. **Infra AMD + Gemma en vLLM** (el requisito que descalifica si falta)
   - Levantar instancia en AMD Developer Cloud (MI300X), servir Gemma con vLLM (endpoint OpenAI-compatible). Guardar `LLM_BASE_URL`, `LLM_MODEL` en env.
   - Hacer una pantalla/panel "AMD" visible en la demo: modelo, GPU, latencia, tokens/s, costo/min.
2. **Ingesta TED → DB**
   - Tablas reales: `contracts` ampliada (ojs id, CPV[], comprador, país, valor, moneda, deadline, tipo notice, URLs doc/submission, lotes) y `contract_matches` con score 0–100, razones y estado.
   - Servicio que llama `searchNotices` con query correcta: solo avisos activos de competencia (cn-standard, cn-social, pin-cfc-standard…), excluir award/corr/veat/etc.; filtrar por país/CPV del perfil; paginar; dedupe; timeout + retry 429.
   - Fallbacks: lote → procedimiento; título multilingüe (EN → IT → primero); `submission-url` nulo → `document-url`.
   - Cache de respuesta de demo (fixture JSON de 3 licitaciones reales) para que la demo no dependa de la red.
3. **Perfil de empresa completo para matching** (campos hoy muertos en schema)
   - UI + escritura de: `cpvCodes`, `certifications` (SOA, ISO…), `languages`, facturación anual, nº empleados, flag PyME, rango de valor de contrato, proyectos de referencia.
4. **Matriz de cumplimiento (la pieza estrella)**
   - Extraer requisitos del pliego (PDF) → lista estructurada {requisito, tipo, página, texto}.
   - **Reglas fijas** (código, no LLM): CUMPLE / NO CUMPLE / FALTA DOCUMENTO + página citada + score 0–100. Regla de oro: el LLM jamás decide elegibilidad.
   - UI: lista de licitaciones (rojo/verde), detalle con la matriz y la cita de página.
5. **Borrador de oferta con Gemma (AMD)** en italiano, usando datos reales de la ficha, marcado "generado por IA", con botón **Aprobar** humano (nunca envía solo). Medir tiempo.
6. **Entrega**: Dockerfile + docker-compose, README raíz que corra de cero, LICENSE MIT, repo público, deploy con URL, `.env.example` actualizado.
7. **Material lablab**: video demo (3 min), slides, portada, descripciones, tags, submit **antes de 10:00 AM VET**.

### P1 — Lo que sube puntaje

8. **Bloques Evolus (mínimo 2, ideal 4–6)**: workflow diario TED, extractores de PDF, knowledge library (ficha empresa), agente/AI tool; integración REST con llave en env. Revisar el contenido de `evolus doc.rar` (workspace + docs) — descomprimir en carpeta aislada.
9. **Benchmark real** en MI300X: horas/licitación, licitaciones/semana, costo/análisis, precisión de la matriz sobre un set etiquetado a mano (aunque sean 10–20 requisitos). **No presentar 92% / 4'37'' / 25 min como medidos si no se midieron**: el PDF mismo dice "estimaciones para la demo".
10. **Traductor IT↔ES/EN con Gemma** (suma al premio Google $5k) y rerank de evidencia.
11. **Guion de demo ensayado** (PDF ya tiene guion 3 min) con datos de TED reales y empresa ficticia coherente (PyME italiana de software, 3 lotes: 2 rojos, 1 verde).
12. **Idioma/branding**: decidir un idioma de UI (hoy inglés; demo y borrador en italiano) y una landing mínima con el claim "De 200 páginas a 1 decisión en 5 minutos".

### P2 — Deuda técnica / seguridad (solo si sobra tiempo; algunas afectan la demo)

13. Bug: cookie expirada crea un negocio nuevo (`actions.ts:24` vs `profiles.ts:91-95`).
14. Aprobación auto-declarada por el cliente; `pending_review` sin uso → o se implementa o se quita (no prometer "abogado valida" si no existe el rol).
15. `drizzle/` está en `.gitignore`: un clon nuevo no migra ni pasa tests. **Arreglar para el repo público** (versionar migraciones o script de bootstrap en README/Docker).
16. Revisar literal tipo-token en `files.test.ts` antes de hacer público el repo; rotar cualquier llave que haya pasado por chats.
17. `better-sqlite3` nativo en Docker/Windows; `PutObject IfNoneMatch` puede no funcionar en S3-compatibles; sin rate-limit; sesiones sin barrido; `schema.md` obsoleto; `.taste-skill/notes.md` contradice README.
18. Tests: TED (mock), matriz de reglas, actions.ts.

## 4. Riesgos de narrativa

- Que parezca "solo un chatbot de PDFs": la matriz con cita de página y reglas fijas debe ser lo primero que se ve.
- Prometer en el pitch (Evolus ×6, abogado partner, MI300X, benchmark) cosas que no estén en el producto: el jurado revisa workspace y uso de API.
- Dato "14% del PIB UE": el propio PDF dice "verificar".

## 5. Seguridad de credenciales

- En el chat se pegó una llave (`rc-…`) y un enlace de Gemini. Tratarla como expuesta: no commitear, ponerla solo en `.env`, rotarla si el chat es compartido.

## 6. Decisiones tomadas (sesión /grill-me, 2026-10-17)

- Equipo: 4–6 personas, 3 carriles (A infra AMD/Evolus, B TED+matching+matriz, C UI/Docker/video). Claude = planeación y estado del proyecto, no implementa código por ahora.
- Alcance: (a) vertical slice primero → (b) benchmark + traductor → (c) extras. El piso (a) es innegociable.
- AMD: cuenta/créditos AMD Developer Cloud listos. Evolus: workspace ya creado.
- Modelos: opción 3 (Gemma redacta/traduce + Qwen extrae/agente, 1 MI300X) con plan B opción 1 (Gemma para todo). Config por variables `LLM_EXTRACT_*` y `LLM_DRAFT_*`.
- Extracción: híbrido (parser propio por página + LLM + Evolus como bloque).
- Demo: PyME italiana de software, 3 licitaciones reales de TED cacheadas, reglas coherentes con software; 6 tipos de requisito.
- Búsqueda TED: toda la UE, sin filtro de país (implica pliegos multilingües y traducción).
- Claims: abogado/PwC = "validador futuro"; solo números medidos.
- Deploy: Dokploy propio en `garefacile.empovaro.com`, Docker.
- Idioma: UI y README en inglés; borrador en italiano.
- Repo: preparar para público + MIT (publicar solo con OK explícito).
- Detalle del apartado IA: ver `AI_DEVELOPERS.md`.
- Git: ramas por carril (`ai/*`, `backend/*`, `ui/*`) + PR rápido a `main`; `main` siempre desplegable en Dokploy.
- Premios: AMD (track 3) + Google (Gemma visible) + Evolus (≥2 bloques por API).
- Entrega/pitch: todo online; un dueño de entrega (sube a lablab y lleva la checklist) y un presentador (guion de 3 min). Nombres por asignar.
- Repo público: **repo nuevo** con **historial completo filtrado** (conserva fechas de commit como prueba de originalidad). Auditar historial y secretos antes de abrirlo; publicar solo con OK explícito.

### Pendientes abiertos
- Hora de freeze de features (propuesta: ~04:00 AM VET) — "se habla luego".
- Nombres: dueño de entrega, presentador, Dev A y Dev B de IA.
- Revisar literal tipo token en `files.test.ts` y rotar llaves expuestas en chat (TED `EU_API_KEY`, Evolus `rc-…`).
- Versionar `drizzle/` o script de bootstrap para clones nuevos.
