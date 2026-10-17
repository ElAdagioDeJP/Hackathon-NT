import { constants } from "node:fs";
import { mkdir, open, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { FileApiError, StoredFileNotFound } from "./errors";

export type StorageProvider = "local" | "s3";
export interface StorageLocation {
  storageProvider: StorageProvider;
  storageBucket: string | null;
  storageKey: string;
}
export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  size: number;
}
export interface DocumentStorage {
  put(key: string, content: Buffer, mimeType: string): Promise<StorageLocation>;
  get(location: StorageLocation): Promise<StoredObject>;
  remove(location: StorageLocation): Promise<void>;
}

interface ObjectStore {
  put(key: string, content: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
  remove(key: string): Promise<void>;
}

function validateKey(key: string) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(key) ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Invalid storage key.");
  }
}

function isWithin(root: string, path: string) {
  const child = relative(root, path);
  return (
    child === "" ||
    (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`))
  );
}

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export class LocalObjectStore implements ObjectStore {
  constructor(private readonly directory: string) {}

  private async path(key: string, writing = false) {
    validateKey(key);
    const root = resolve(/*turbopackIgnore: true*/ this.directory);
    if (writing) await mkdir(root, { recursive: true, mode: 0o700 });
    const canonicalRoot = await realpath(root);
    const file = resolve(canonicalRoot, key);
    if (!isWithin(canonicalRoot, file))
      throw new Error("Invalid storage path.");
    if (writing) {
      let parent = canonicalRoot;
      for (const segment of key.split("/").slice(0, -1)) {
        parent = resolve(parent, segment);
        await mkdir(parent, { recursive: true, mode: 0o700 });
        if (!isWithin(canonicalRoot, await realpath(parent)))
          throw new Error("Invalid storage path.");
      }
    }
    // Refuse symlinked parent directories outside the configured upload root.
    if (!isWithin(canonicalRoot, await realpath(dirname(file))))
      throw new Error("Invalid storage path.");
    return file;
  }

  async put(key: string, content: Buffer) {
    const file = await this.path(key, true);
    const handle = await open(
      file,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(content);
    } catch (error) {
      await rm(file, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      await handle.close();
    }
  }

  async get(key: string): Promise<StoredObject> {
    try {
      const handle = await open(
        await this.path(key),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) throw new Error("The storage key is not a file.");
        return {
          body: Readable.toWeb(
            handle.createReadStream(),
          ) as ReadableStream<Uint8Array>,
          size: stat.size,
        };
      } catch (error) {
        await handle.close();
        throw error;
      }
    } catch (error) {
      if (isMissing(error)) throw new StoredFileNotFound();
      throw error;
    }
  }

  async remove(key: string) {
    try {
      await rm(await this.path(key), { force: true });
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
}

export class S3ObjectStore implements ObjectStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, content: Buffer, mimeType: string) {
    validateKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: mimeType,
        ContentLength: content.length,
        IfNoneMatch: "*",
      }),
    );
  }

  async get(key: string): Promise<StoredObject> {
    validateKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body || result.ContentLength === undefined)
        throw new Error("Invalid storage response.");
      return {
        body: result.Body.transformToWebStream(),
        size: result.ContentLength,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NoSuchKey" ||
          ("$metadata" in error &&
            (error.$metadata as { httpStatusCode?: number }).httpStatusCode ===
              404))
      ) {
        throw new StoredFileNotFound();
      }
      throw error;
    }
  }

  async remove(key: string) {
    validateKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

export interface StorageConfig {
  provider: StorageProvider;
  localDirectory: string;
  s3Bucket?: string;
  s3?: S3ClientConfig;
}

export function storageConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): StorageConfig {
  const provider = env.FILES_STORAGE_PROVIDER ?? "local";
  if (provider !== "local" && provider !== "s3")
    throw new FileApiError(
      503,
      "STORAGE_CONFIG",
      "Unknown file storage provider.",
    );
  // Uploads are runtime data, not assets to trace into the deployment bundle.
  const localDirectory = resolve(
    /*turbopackIgnore: true*/ env.FILES_LOCAL_DIR ?? "./var/uploads",
  );
  if (isWithin(resolve("./public"), localDirectory))
    throw new FileApiError(
      503,
      "STORAGE_CONFIG",
      "The upload directory must be outside public assets.",
    );
  if (provider === "s3" && !env.FILES_S3_BUCKET)
    throw new FileApiError(
      503,
      "STORAGE_CONFIG",
      "The file storage bucket is not configured.",
    );
  if (
    Boolean(env.FILES_S3_ACCESS_KEY_ID) !==
    Boolean(env.FILES_S3_SECRET_ACCESS_KEY)
  )
    throw new FileApiError(
      503,
      "STORAGE_CONFIG",
      "Incomplete file storage credentials.",
    );
  if (env.FILES_S3_ENDPOINT && !/^https?:\/\//.test(env.FILES_S3_ENDPOINT))
    throw new FileApiError(
      503,
      "STORAGE_CONFIG",
      "Invalid file storage endpoint.",
    );
  if (
    env.FILES_S3_FORCE_PATH_STYLE &&
    !["true", "false"].includes(env.FILES_S3_FORCE_PATH_STYLE)
  )
    throw new FileApiError(
      503,
      "STORAGE_CONFIG",
      "Invalid path-style setting.",
    );
  return {
    provider,
    localDirectory,
    s3Bucket: env.FILES_S3_BUCKET,
    s3: {
      region: env.FILES_S3_REGION ?? env.AWS_REGION ?? "us-east-1",
      endpoint: env.FILES_S3_ENDPOINT || undefined,
      forcePathStyle: env.FILES_S3_FORCE_PATH_STYLE === "true",
      ...(env.FILES_S3_ACCESS_KEY_ID && env.FILES_S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.FILES_S3_ACCESS_KEY_ID,
              secretAccessKey: env.FILES_S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    },
  };
}

export function createDocumentStorage(config: StorageConfig): DocumentStorage {
  const local = new LocalObjectStore(config.localDirectory);
  let client: S3Client | undefined;
  function store(
    provider: StorageProvider,
    bucket: string | null,
  ): ObjectStore {
    if (provider === "local") return local;
    if (provider !== "s3" || !bucket)
      throw new FileApiError(
        503,
        "STORAGE_CONFIG",
        "The document storage location is not configured.",
      );
    client ??= new S3Client(config.s3 ?? {});
    return new S3ObjectStore(client, bucket);
  }
  return {
    async put(key, content, mimeType) {
      const location: StorageLocation = {
        storageProvider: config.provider,
        storageBucket:
          config.provider === "s3" ? (config.s3Bucket ?? null) : null,
        storageKey: key,
      };
      await store(location.storageProvider, location.storageBucket).put(
        key,
        content,
        mimeType,
      );
      return location;
    },
    get(location) {
      return store(location.storageProvider, location.storageBucket).get(
        location.storageKey,
      );
    },
    remove(location) {
      return store(location.storageProvider, location.storageBucket).remove(
        location.storageKey,
      );
    },
  };
}
