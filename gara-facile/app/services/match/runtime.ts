import { createMatchService } from "./find-matches";

export async function getMatchService() {
  if (!process.env.DB_FILE_NAME) {
    throw new Error("The business database is not configured.");
  }
  const { db } = await import("../../db");
  return createMatchService(db);
}
