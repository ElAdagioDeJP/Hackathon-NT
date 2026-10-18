import type { BusinessModel, ContractModel } from "./types";

const DEFAULT_BASE_URL = "https://api.evolus.ai/v1";

export class EvolusApiError extends Error {
  readonly status?: number;
  readonly body?: unknown;

  constructor(
    message: string,
    options?: { status?: number; body?: unknown; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "EvolusApiError";
    this.status = options?.status;
    this.body = options?.body;
  }
}

export interface EvolusConfig {
  apiKey: string;
  appId: string;
  agentId: string;
  baseUrl: string;
}

export interface EvolusMatchOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  config?: EvolusConfig;
}

// "assistant" is the main agent (EVOLUS_AGENT_ID); "match" is the Matching agent
// (EVOLUS_MATCH_AGENT_ID, falling back to EVOLUS_AGENT_ID).
export type EvolusAgentRole = "assistant" | "match";

export function readEvolusConfig(
  env: NodeJS.ProcessEnv = process.env,
  role: EvolusAgentRole = "assistant",
): EvolusConfig {
  const apiKey = env.EVOLUS_API_KEY?.trim();
  const appId = env.EVOLUS_APP_ID?.trim();
  const agentVar = role === "match" ? "EVOLUS_MATCH_AGENT_ID" : "EVOLUS_AGENT_ID";
  const agentId =
    (role === "match" ? env.EVOLUS_MATCH_AGENT_ID?.trim() : undefined) ||
    env.EVOLUS_AGENT_ID?.trim();
  const baseUrl = (env.EVOLUS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );

  const missing = [
    !apiKey && "EVOLUS_API_KEY",
    !appId && "EVOLUS_APP_ID",
    !agentId && agentVar,
  ].filter(Boolean);

  if (missing.length) {
    throw new EvolusApiError(
      `Matching is not configured. Missing ${missing.join(", ")}.`,
    );
  }

  return { apiKey: apiKey!, appId: appId!, agentId: agentId!, baseUrl };
}

export async function requestEvolusMatches(
  business: BusinessModel,
  contracts: ContractModel[],
  options?: EvolusMatchOptions,
): Promise<string> {
  const config = options?.config ?? readEvolusConfig(process.env, "match");
  const fetchImpl = options?.fetchImpl ?? fetch;
  const model = `${config.appId}:${config.agentId}`;
  const userContent = buildMatchUserMessage(business, contracts);

  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: options?.signal,
    });
  } catch (error) {
    throw new EvolusApiError(
      `Evolus request failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const raw = await response.text().catch(() => "");
  if (!response.ok) {
    throw new EvolusApiError(`Evolus returned ${response.status}`, {
      status: response.status,
      body: safeJsonParse(raw),
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new EvolusApiError("Failed to parse Evolus chat response.");
  }

  const content = extractAssistantContent(payload);
  if (!content) {
    throw new EvolusApiError("Evolus returned an empty assistant message.");
  }
  return content;
}

export function buildMatchUserMessage(
  business: BusinessModel,
  contracts: ContractModel[],
): string {
  return [
    "Compare this business to each contract in the candidate set.",
    "Return JSON only, shaped as:",
    '{"matches":[{"contractId":"...","type":"exact|partial|none","score":0,"rationale":"..."}]}',
    "Include exactly one result per contractId in the candidate set.",
    "",
    "Business Model:",
    JSON.stringify(business, null, 2),
    "",
    "Candidate set:",
    JSON.stringify(contracts, null, 2),
  ].join("\n");
}

function extractAssistantContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0]) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  return typeof content === "string" ? content : null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
