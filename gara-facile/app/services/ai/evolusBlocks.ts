// Evolus building blocks called by the app over REST: the requirements extractor
// (second opinion on our own extraction) and the tender intake workflow.
// Server-only. Every call costs Evolus credits: callers cache and never retry in a loop.
import { EvolusApiError } from "../match/evolus";
import { evolusRequest, type EvolusDeps } from "./evolus";
import { REQUIREMENT_KINDS, type Requirement, type RequirementKind } from "./types";

export interface EvolusRequirement {
  kind: RequirementKind;
  description: string;
  value?: string;
  page: number;
  quote: string;
}

export interface ExtractorComparison {
  ours: number;
  evolus: number;
  matched: { kind: RequirementKind; ourPage: number; evolusPage: number }[];
  onlyOurs: { kind: RequirementKind; page: number }[];
  onlyEvolus: { kind: RequirementKind; page: number }[];
}

function env(deps: EvolusDeps) {
  return deps.env ?? process.env;
}

function required(deps: EvolusDeps, name: string): string {
  const value = env(deps)[name]?.trim();
  if (!value) throw new EvolusApiError(`Evolus is not configured. Missing ${name}.`);
  return value;
}

/**
 * Sends one PDF to the requirements extractor and returns its items.
 * Path: /agents/{EVOLUS_EXTRACTOR_AGENT_ID or EVOLUS_AGENT_ID}/json/{EVOLUS_EXTRACTOR_ID}/ask-file
 */
export async function extractWithEvolus(
  pdf: Uint8Array<ArrayBuffer>,
  fileName: string,
  deps: EvolusDeps = {},
): Promise<EvolusRequirement[]> {
  const extractorId = required(deps, "EVOLUS_EXTRACTOR_ID");
  const agentId =
    env(deps).EVOLUS_EXTRACTOR_AGENT_ID?.trim() || required(deps, "EVOLUS_AGENT_ID");
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), fileName);
  const body = await evolusRequest(
    `/agents/${encodeURIComponent(agentId)}/json/${encodeURIComponent(extractorId)}/ask-file?useWebhook=false`,
    { method: "POST", body: form },
    { timeoutMs: 600_000, ...deps },
  );
  return normalizeEvolusRequirements(body);
}

/** Accepts `{ requirements: [...] }`, a bare array, or either wrapped as a JSON string. */
export function normalizeEvolusRequirements(body: unknown): EvolusRequirement[] {
  let data = body;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(data)
    ? data
    : (data as { requirements?: unknown } | null)?.requirements;
  if (!Array.isArray(list)) return [];
  const items: EvolusRequirement[] = [];
  for (const raw of list) {
    const item = raw as Record<string, unknown>;
    const kind = item.kind as RequirementKind;
    const page = Number(item.page);
    if (!REQUIREMENT_KINDS.includes(kind) || !Number.isInteger(page) || page < 1) continue;
    items.push({
      kind,
      description: String(item.description ?? ""),
      ...(item.value !== undefined && item.value !== null ? { value: String(item.value) } : {}),
      page,
      quote: String(item.quote ?? ""),
    });
  }
  return items;
}

/** Pairs requirements of the same kind whose pages are at most one apart. */
export function compareExtractions(
  ours: Requirement[],
  evolus: EvolusRequirement[],
): ExtractorComparison {
  const left = [...evolus];
  const matched: ExtractorComparison["matched"] = [];
  const onlyOurs: ExtractorComparison["onlyOurs"] = [];
  for (const req of ours) {
    const index = left.findIndex((e) => e.kind === req.kind && Math.abs(e.page - req.page) <= 1);
    if (index === -1) {
      onlyOurs.push({ kind: req.kind, page: req.page });
      continue;
    }
    matched.push({ kind: req.kind, ourPage: req.page, evolusPage: left[index].page });
    left.splice(index, 1);
  }
  return {
    ours: ours.length,
    evolus: evolus.length,
    matched,
    onlyOurs,
    onlyEvolus: left.map((e) => ({ kind: e.kind, page: e.page })),
  };
}

export interface WorkflowRun {
  executionId: string;
}

export interface WorkflowExecution {
  executionId: string;
  status: string; // Pending | Running | Completed | Failed
  output: unknown;
}

/** Queues the tender intake workflow with one PDF (202 Accepted → executionId). */
export async function startTenderWorkflow(
  pdf: Uint8Array<ArrayBuffer>,
  fileName: string,
  input: string,
  deps: EvolusDeps = {},
): Promise<WorkflowRun> {
  const workflowId = required(deps, "EVOLUS_WORKFLOW_ID");
  const form = new FormData();
  form.append("input", input);
  form.append("file", new Blob([pdf], { type: "application/pdf" }), fileName);
  const body = (await evolusRequest(
    `/workflows/${encodeURIComponent(workflowId)}/execute`,
    { method: "POST", body: form },
    deps,
  )) as { executionId?: string } | null;
  if (!body?.executionId) throw new EvolusApiError("Evolus did not return an executionId.");
  return { executionId: body.executionId };
}

export async function getTenderWorkflowExecution(
  executionId: string,
  deps: EvolusDeps = {},
): Promise<WorkflowExecution> {
  const workflowId = required(deps, "EVOLUS_WORKFLOW_ID");
  const body = (await evolusRequest(
    `/workflows/${encodeURIComponent(workflowId)}/executions/${encodeURIComponent(executionId)}`,
    {},
    deps,
  )) as Record<string, unknown> | null;
  return {
    executionId,
    status: String(body?.status ?? "Unknown"),
    output: body?.output ?? body?.result ?? null,
  };
}

/** Maps Evolus failures to HTTP: missing config 503, credits/rate limits passed through, else 502. */
export function evolusErrorResponse(error: unknown): Response {
  if (!(error instanceof EvolusApiError)) throw error;
  const status = error.status;
  const message = error.message;
  console.error({ status: status ?? null, message });
  if (status === undefined && message.includes("not configured"))
    return Response.json({ error: "Evolus is not configured." }, { status: 503 });
  if (status === 402)
    return Response.json({ error: "Evolus credits are exhausted." }, { status });
  if (status === 409)
    return Response.json({ error: "The Evolus agent is paused or busy." }, { status });
  if (status === 429)
    return Response.json({ error: "Evolus is rate limiting requests. Try again later." }, { status });
  return Response.json({ error: "Evolus is temporarily unavailable. Try again later." }, { status: 502 });
}
