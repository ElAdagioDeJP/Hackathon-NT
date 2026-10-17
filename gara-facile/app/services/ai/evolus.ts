// Server-only: reads EVOLUS_* secrets from process.env. Never import from client components.
import {
  EvolusApiError,
  readEvolusConfig,
  type EvolusConfig,
} from "../match/evolus";

const REST_BASE_URL = "https://api.evolus.ai/api/v1";
const TIMEOUT_MS = 30_000;

export interface EvolusDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  config?: EvolusConfig;
  log?: (line: string) => void;
}

export interface EvolusChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface EvolusChatResult {
  content: string;
  conversationId: string | null;
}

/** REST API (`/api/v1`) with X-ApiKey + X-Application-Id. Returns the parsed JSON body. */
export async function evolusRequest(
  path: string,
  init: RequestInit = {},
  deps: EvolusDeps = {},
): Promise<unknown> {
  const env = deps.env ?? process.env;
  const apiKey = env.EVOLUS_API_KEY?.trim();
  const appId = env.EVOLUS_APP_ID?.trim();
  if (!apiKey || !appId) {
    throw new EvolusApiError(
      "Evolus is not configured. Missing EVOLUS_API_KEY or EVOLUS_APP_ID.",
    );
  }

  const headers = new Headers(init.headers);
  headers.set("X-ApiKey", apiKey);
  headers.set("X-Application-Id", appId);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const { body } = await call(path, `${REST_BASE_URL}${path}`, { ...init, headers }, deps);
  return body;
}

/** OpenAI-compatible agent chat. Pass conversationId to continue a conversation. */
export async function evolusChat(
  messages: EvolusChatMessage[],
  conversationId?: string,
  deps: EvolusDeps = {},
): Promise<EvolusChatResult> {
  const config = deps.config ?? readEvolusConfig(deps.env);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  if (conversationId) headers["X-Conversation-Id"] = conversationId;

  const { body, response } = await call(
    "/chat/completions",
    `${config.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ model: `${config.appId}:${config.agentId}`, messages }),
    },
    deps,
  );

  const content = (body as { choices?: { message?: { content?: unknown } }[] })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) {
    throw new EvolusApiError("Evolus returned an empty assistant message.");
  }
  return { content, conversationId: response.headers.get("X-Conversation-Id") };
}

async function call(
  path: string,
  url: string,
  init: RequestInit,
  deps: EvolusDeps,
): Promise<{ body: unknown; response: Response }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? console.log;
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const method = init.method ?? "GET";
  const started = Date.now();
  // Evidence of API usage: route, status and latency only, never headers or bodies.
  const record = (status: number) =>
    log(JSON.stringify({ evolus: { method, path, status, ms: Date.now() - started } }));

  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal });
  } catch (error) {
    record(0);
    throw new EvolusApiError(
      `Evolus request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  record(response.status);

  const raw = await response.text().catch(() => "");
  let body: unknown = raw;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    // Keep the raw text so error messages still show what Evolus said.
  }

  if (!response.ok) {
    throw new EvolusApiError(`Evolus returned ${response.status}`, {
      status: response.status,
      body,
    });
  }
  return { body, response };
}
