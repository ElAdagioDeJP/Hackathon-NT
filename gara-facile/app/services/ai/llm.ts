// OpenAI-compatible client for the vLLM servers on AMD. Every call is timed
// and recorded in ai_runs. Plan B = both roles point at the same server.
import { z } from "zod";
import type { LlmRole } from "./types";

export type Message = { role: "system" | "user" | "assistant"; content: string };

export interface ChatOptions<T> {
  role: LlmRole;
  messages: Message[];
  schema?: z.ZodType<T>;
  schemaName?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResult<T> {
  content: string;
  data: T;
  model: string;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface AiRun {
  role: LlmRole;
  model: string;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
  ok: boolean;
  error?: string;
}

export interface Endpoint {
  baseUrl: string;
  model: string;
  apiKey: string;
  reasoningEffort?: string; // e.g. "low" for thinking models on AMD Token Factory
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export const TIMEOUT_MS = 120_000;
// Never wait longer than this for a 429 Retry-After before the single retry.
export const MAX_RETRY_WAIT_MS = 60_000;

export function endpointFor(
  role: LlmRole,
  env: Record<string, string | undefined> = process.env,
): Endpoint {
  const prefix = role === "extract" ? "LLM_EXTRACT" : "LLM_DRAFT";
  const baseUrl = env[`${prefix}_BASE_URL`];
  const model = env[`${prefix}_MODEL`];
  if (!baseUrl || !model)
    throw new LlmError(`${prefix}_BASE_URL and ${prefix}_MODEL must be set.`);
  const reasoningEffort = env[`${prefix}_REASONING_EFFORT`];
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    apiKey: env[`${prefix}_API_KEY`] ?? "",
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

// Models sometimes wrap JSON in a fenced block despite response_format.
function parseJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((fenced ? fenced[1] : content).trim());
}

const retryable = (status: number) => status === 429 || status >= 500;

// 429s carry Retry-After (seconds); 5xx and network errors retry after 1 s.
function retryDelayMs(res?: Response) {
  const header = Number(res?.headers.get("retry-after"));
  if (res?.status === 429 && Number.isFinite(header) && header > 0)
    return Math.min(header * 1000, MAX_RETRY_WAIT_MS);
  return 1000;
}

export function createLlmClient(deps: {
  fetch?: typeof fetch;
  record?: (run: AiRun) => void | Promise<void>;
  endpoint?: (role: LlmRole) => Endpoint;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const doFetch = deps.fetch ?? fetch;
  const endpoint = deps.endpoint ?? ((role: LlmRole) => endpointFor(role));
  const timeoutMs = deps.timeoutMs ?? (Number(process.env.LLM_TIMEOUT_MS) || TIMEOUT_MS);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function post(url: string, init: RequestInit, signal?: AbortSignal) {
    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let res: Response | undefined;
      try {
        res = await doFetch(url, { ...init, signal: combined });
        if (res.ok || attempt > 0 || !retryable(res.status)) return res;
      } catch (error) {
        if (signal?.aborted || attempt > 0) throw error;
      }
      await sleep(retryDelayMs(res));
    }
  }

  async function chat<T = string>(options: ChatOptions<T>): Promise<ChatResult<T>> {
    const target = endpoint(options.role);
    const started = performance.now();
    const run: AiRun = { role: options.role, model: target.model, ms: 0, ok: false };
    try {
      const body: Record<string, unknown> = {
        model: target.model,
        messages: options.messages,
        temperature: options.temperature ?? (options.schema ? 0 : 0.4),
      };
      if (options.maxTokens) body.max_tokens = options.maxTokens;
      if (target.reasoningEffort) body.reasoning_effort = target.reasoningEffort;
      if (options.schema)
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: options.schemaName ?? "output",
            schema: z.toJSONSchema(options.schema),
          },
        };
      const res = await post(
        `${target.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(target.apiKey ? { authorization: `Bearer ${target.apiKey}` } : {}),
          },
          body: JSON.stringify(body),
        },
        options.signal,
      );
      if (!res.ok)
        throw new LlmError(`LLM ${options.role} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
      const json = (await res.json()) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      run.model = json.model ?? target.model;
      run.promptTokens = json.usage?.prompt_tokens;
      run.completionTokens = json.usage?.completion_tokens;
      let data: T;
      if (options.schema) {
        const parsed = options.schema.safeParse(parseJson(content));
        if (!parsed.success)
          throw new LlmError(`LLM ${options.role} returned JSON not matching schema: ${parsed.error.message.slice(0, 300)}`);
        data = parsed.data;
      } else data = content as T;
      run.ok = true;
      return {
        content,
        data,
        model: run.model,
        ms: Math.round(performance.now() - started),
        promptTokens: run.promptTokens,
        completionTokens: run.completionTokens,
      };
    } catch (error) {
      run.error = error instanceof Error ? error.message.slice(0, 500) : String(error);
      throw error;
    } finally {
      run.ms = Math.round(performance.now() - started);
      await Promise.resolve(deps.record?.(run)).catch(() => undefined);
    }
  }

  return {
    chat,
    async health(role: LlmRole) {
      const started = performance.now();
      try {
        const target = endpoint(role);
        const res = await post(`${target.baseUrl}/models`, {
          headers: target.apiKey ? { authorization: `Bearer ${target.apiKey}` } : {},
        });
        const ms = Math.round(performance.now() - started);
        if (!res.ok) return { model: target.model, ok: false, ms, error: `HTTP ${res.status}` };
        const json = (await res.json()) as { data?: { id: string }[] };
        const served = json.data?.map((m) => m.id) ?? [];
        return { model: target.model, ok: served.includes(target.model), ms };
      } catch (error) {
        return {
          model: null,
          ok: false,
          ms: Math.round(performance.now() - started),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

async function recordRun(run: AiRun) {
  if (!process.env.DB_FILE_NAME) return;
  const [{ db }, { aiRuns }] = await Promise.all([import("../../db"), import("../../db/schema")]);
  db.insert(aiRuns).values(run).run();
}

const client = createLlmClient({ record: recordRun });
export const chat = client.chat;
export const health = client.health;
