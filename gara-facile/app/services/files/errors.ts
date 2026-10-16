export class FileApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FileApiError";
  }
}

export class StoredFileNotFound extends Error {
  constructor() {
    super("The stored file was not found.");
    this.name = "StoredFileNotFound";
  }
}
