import { createProfileService } from "./profiles";

export async function getProfileService() {
  if (!process.env.DB_FILE_NAME)
    throw new Error("The business database is not configured.");
  const { db } = await import("../../db");
  return createProfileService(db);
}
