import { createDocumentService, type DocumentService } from "./documents";
import { FileApiError } from "./errors";
import { createDocumentApi } from "./http";
import { createDocumentStorage, storageConfigFromEnv } from "./storage";
import { authorizeProfileRequest } from "../business/session";

let servicePromise: Promise<DocumentService> | undefined;

export async function getDocumentService() {
  // Keep configuration and SQLite initialization out of module evaluation/builds.
  if (!process.env.DB_FILE_NAME)
    throw new FileApiError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "The document database is not configured.",
    );
  if (!servicePromise) {
    const storage = createDocumentStorage(storageConfigFromEnv());
    servicePromise = import("../../db").then(({ db }) =>
      createDocumentService(db, storage),
    );
    servicePromise.catch(() => {
      servicePromise = undefined;
    });
  }
  return servicePromise;
}

export const documentApi = createDocumentApi({
  getService: getDocumentService,
  getToken: () => process.env.FILES_API_TOKEN,
  authorizeSession: authorizeProfileRequest,
});
