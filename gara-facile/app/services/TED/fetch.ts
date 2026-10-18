import type { TedSearchRequest, TedSearchResponse } from "./types";

const TED_SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search";

export class TedApiError extends Error {
  readonly status?: number;
  readonly body?: unknown;

  constructor(
    message: string,
    options?: { status?: number; body?: unknown; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "TedApiError";
    this.status = options?.status;
    this.body = options?.body;
  }
}

export interface SearchNoticesOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function searchNotices(
  body: TedSearchRequest,
  options?: SearchNoticesOptions,
): Promise<TedSearchResponse> {
  const apiKey = process.env.EU_API_KEY;
  if (!apiKey) {
    throw new TedApiError("Missing EU_API_KEY environment variable");
  }

  const fetchImpl = options?.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(TED_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
  } catch (error) {
    throw new TedApiError(
      `TED search request failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new TedApiError(`TED search request returned ${response.status}`, {
      status: response.status,
      body: safeJsonParse(raw),
    });
  }

  try {
    return (await response.json()) as TedSearchResponse;
  } catch (error) {
    throw new TedApiError(
      `Failed to parse TED search response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
