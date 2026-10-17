#!/bin/sh
# Container entrypoint: sync the SQLite schema, then start Next.js.
# Migrations are generated locally and not versioned (see .gitignore), so the
# container applies app/db/schema.ts with drizzle-kit push. It only adds what
# is missing; a destructive change stops here instead of dropping data.
set -e
mkdir -p "$(dirname "$DB_FILE_NAME")" "$FILES_LOCAL_DIR"
node_modules/.bin/drizzle-kit push
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
