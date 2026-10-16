# Gara Facile

Aplicación para definir un perfil de empresa y, más adelante, compararlo con licitaciones públicas europeas de TED.

## Desarrollo

Usa Bun 1.4.2, la versión indicada en `package.json`. Las versiones anteriores pueden no leer `bun.lock`.

```bash
cd gara-facile
bun install --frozen-lockfile
cp -n .env.example .env
bun run db:generate
bun run db:migrate
bun run dev --hostname 0.0.0.0
```

Abre http://localhost:3000. El formulario requiere `DB_FILE_NAME` y una base migrada. Estos pasos son para una base nueva; consulta la sección de migraciones si ya tienes tablas creadas con `drizzle-kit push`.

## Formulario de empresa

El formulario tiene secciones de empresa, capacidades, documentos opcionales y revisión. Recoge nombre, país, ciudad, servicios o productos, cobertura, capacidad y experiencia. Permite declarar que la empresa está empezando, sin inventar experiencia.

La interfaz está en inglés, incluidos los errores, ejemplos, países, textos de accesibilidad y metadatos. Esta convención está definida en `AGENTS.md`.

El resumen lateral refleja lo escrito. El indicador cuenta seis grupos de información completos y no estima la elegibilidad de la empresa. “Load example” introduce datos ficticios de Voltio Electrical para recorrer la interfaz.

El formulario guarda el perfil mediante Server Actions al avanzar o pulsar “Save draft”. Al volver desde el mismo navegador, recupera los datos y documentos guardados. “Confirm profile” valida los datos completos y registra la aprobación; todavía no ejecuta análisis con IA ni matches.

Una cookie HttpOnly vincula el navegador con su perfil durante 30 días. La base solo guarda el hash de ese identificador. Es acceso anónimo por navegador, no una cuenta de usuario: no hay login ni recuperación desde otro dispositivo. El token de operador de archivos nunca llega al navegador.

La selección de documentos distingue contexto y documentación legal/fiscal. Acepta PDF, DOC y DOCX de hasta 10 MB, con un máximo de cinco por categoría. La API también comprueba el tamaño, las firmas de formato y la cuota por perfil.

## API de archivos

La API permite subir, listar, descargar y eliminar documentos de un perfil existente. El formulario ya la utiliza con su cookie privada y comprobación de pertenencia. Soporta disco local y buckets compatibles con S3, seleccionados por variables de entorno. Requiere Node.js 22 o posterior y una base migrada. `FILES_API_TOKEN` es opcional para acceso de operador o servidor a servidor. La configuración de ejemplo está en `.env.example`.

Consulta [docs/files-api.md](docs/files-api.md) para configuración, endpoints, ejemplos y comportamiento ante fallos. Las pruebas se ejecutan con `bun run test:files` y no necesitan credenciales cloud.

## Datos y migraciones

`app/db/schema.ts` mantiene las entidades existentes y amplía:

- `businesses`: identidad y ubicación. Email y teléfono pasan a ser opcionales.
- `business_records`: versiones del perfil, vinculadas a los matches existentes. Incluyen servicios, cobertura, capacidad, experiencia, códigos CPV, certificaciones, idiomas, resumen de contexto, estado de revisión y fechas. Los datos no informados quedan desconocidos, no aprobados por defecto.
- `business_documents`: metadatos de cada documento, categoría, tipo MIME, tamaño, clave de almacenamiento, texto extraído opcional, estado de procesamiento y fecha de caducidad opcional.

Los archivos no se almacenan como BLOB. `storageKey` es una referencia relativa y única al archivo. `storageProvider` y `storageBucket` conservan su ubicación aunque cambie el destino de nuevas subidas. Las ediciones y los cambios de documentos vuelven a poner el perfil en borrador y actualizan sus fechas. Si un perfil ya está referenciado por un match, su edición se rechaza para conservar ese contexto; la creación de versiones posteriores queda para el flujo de matching.

Solo se versiona el schema actualizado. Las migraciones y snapshots de `drizzle/` se generan localmente y están excluidos de Git. Genera las migraciones antes de ejecutar las pruebas de base de datos, perfiles o archivos en un checkout nuevo.

Para una **base nueva**, configura `DB_FILE_NAME` y ejecuta:

```bash
bun run db:generate
DB_FILE_NAME=./sqlite.db bun run db:migrate
```

Si tu base se creó con `drizzle-kit push`, ya tiene las tablas pero no el historial de migraciones. No ejecutes la migración inicial encima: primero hay que establecer su baseline.

Para generar cambios futuros y comprobar las migraciones sin tocar una base real:

```bash
bun run db:generate
bun run db:check
bun run test:files
```

`db:check` usa el migrador real de Drizzle y dos bases en memoria: una nueva y otra con empresas, perfiles, contratos, matches y propuestas existentes. Comprueba conservación de datos, vista, claves foráneas, valores por defecto y repetición del migrador.

## Servicio TED existente

`app/services/TED/fetch.ts` expone `searchNotices`. Necesita `EU_API_KEY` en el entorno del servidor. `app/services/TED/test.zsh` permite probar la consulta por separado. Este servicio todavía no está conectado al formulario.

## Verificación

```bash
bun run lint
bun run build
bun run db:check
bun run test:profiles
bun run test:files
bun run test:files:http
```
