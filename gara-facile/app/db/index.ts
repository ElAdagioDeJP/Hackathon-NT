// src/db/index.ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

const sqlite = new Database(process.env.DB_FILE_NAME!);
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
export const db = drizzle({ client: sqlite });
