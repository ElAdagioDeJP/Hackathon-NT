// Bid draft (D6): TenderAnalysis + Requirement[] + CompanyFacts → Italian draft.
// The LLM only writes the three narrative sections from a facts block; the
// compliance section is built deterministically from the analysis results.
// Every section ends with DRAFT_FOOTER. LlmError from chat propagates.
import { z } from "zod";
import { companyFactsText } from "./library";
import { chat as defaultChat } from "./llm";
import { DRAFT_SYSTEM, draftUserPrompt } from "./prompts/draft.v1";
import type { CompanyFacts, Requirement, TenderAnalysis } from "./types";

export const DRAFT_FOOTER = "Generato con IA — da revisionare";

// Thinking models spend part of the budget reasoning before the JSON.
export const DRAFT_MAX_TOKENS = 8000;

export type DraftSectionKey = "presentazione" | "esperienza" | "piano" | "conformita";

export interface DraftSection {
  key: DraftSectionKey;
  title: string;
  body: string;
}

export interface BidDraft {
  status: "draft";
  language: string;
  sections: DraftSection[];
  warnings: string[];
  generatedBy: {
    model: string;
    ms: number;
    promptTokens?: number;
    completionTokens?: number;
  };
}

const draftLlmSchema = z.object({
  presentazione: z.string().min(1),
  esperienza: z.string().min(1),
  piano: z.string().min(1),
});

type Chat = typeof defaultChat;

const NUMBER_RE = /\d+(?:[.,'\s]\d+)*/g;

// Maximal digit runs (separators stripped) of length >= 3 in a text.
function longNumbers(text: string) {
  const out: string[] = [];
  for (const match of text.matchAll(NUMBER_RE)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length >= 3) out.push(digits);
  }
  return out;
}

// Every number with >= 3 digits in the LLM text must already appear in the
// facts block, the requirements, or the analysis results; anything else is a
// possible hallucination.
export function findInventedNumbers(llmText: string, factsText: string) {
  const known = new Set(longNumbers(factsText));
  const invented: string[] = [];
  for (const digits of longNumbers(llmText)) {
    if (!known.has(digits) && !invented.includes(digits)) invented.push(digits);
  }
  return invented;
}

function withFooter(body: string) {
  return `${body.trimEnd()}\n\n${DRAFT_FOOTER}`;
}

// Deterministic: one line per requirement with the status decided by the rules.
export function complianceBody(
  tenderId: string,
  requirements: Requirement[],
  results: TenderAnalysis["results"],
) {
  const byId = new Map(results.map((r) => [r.requirementId, r]));
  const lines = requirements.map((req) => {
    const result = byId.get(req.id);
    const status = result?.status ?? "MISSING_DOC";
    const detail = result?.reason ?? "No analysis result for this requirement.";
    const evidence = result?.evidence ? ` Prova: ${result.evidence}.` : "";
    const wanted =
      req.value !== undefined ? ` (valore richiesto: ${req.value}${req.unit ? ` ${req.unit}` : ""})` : "";
    return `- ${req.id} (${req.kind}): ${req.description}${wanted} — Esito: ${status}. ${detail}${evidence}`;
  });
  return [
    `Dichiarazione di conformità ai requisiti del bando ${tenderId}:`,
    ...lines,
  ].join("\n");
}

export async function generateDraft(
  input: {
    analysis: TenderAnalysis;
    requirements: Requirement[];
    company: CompanyFacts;
    language?: string;
    tenderTitle?: string;
    signal?: AbortSignal;
  },
  deps: { chat?: Chat } = {},
): Promise<BidDraft> {
  const chat = deps.chat ?? defaultChat;
  const facts = companyFactsText(input.company);
  const byId = new Map(input.analysis.results.map((r) => [r.requirementId, r]));
  const out = await chat({
    role: "draft",
    schema: draftLlmSchema,
    schemaName: "draft",
    maxTokens: DRAFT_MAX_TOKENS,
    signal: input.signal,
    messages: [
      { role: "system", content: DRAFT_SYSTEM },
      {
        role: "user",
        content: draftUserPrompt({
          tenderId: input.analysis.tenderId,
          tenderTitle: input.tenderTitle,
          facts,
          requirements: input.requirements.map((req) => ({
            id: req.id,
            kind: req.kind,
            description: req.description,
            status: byId.get(req.id)?.status ?? "MISSING_DOC",
            reason: byId.get(req.id)?.reason ?? "No analysis result for this requirement.",
          })),
        }),
      },
    ],
  });

  const warnings: string[] = [];
  const failed = input.analysis.results.filter((r) => r.status === "FAILS");
  // A failing requirement does not block the draft, but the warning goes first.
  if (failed.length > 0)
    warnings.push(
      `One or more requirements are not met (FAILS): ${failed.map((r) => r.requirementId).join(", ")}. The draft was still generated; review these points before submitting.`,
    );
  const missing = input.analysis.results.filter((r) => r.status === "MISSING_DOC");
  if (missing.length > 0)
    warnings.push(
      `One or more requirements lack supporting documents (MISSING_DOC): ${missing.map((r) => r.requirementId).join(", ")}. The draft was still generated; attach the missing documents before submitting.`,
    );
  const invented = findInventedNumbers(
    [out.data.presentazione, out.data.esperienza, out.data.piano].join("\n"),
    [
      facts,
      ...input.requirements.flatMap((req) => [req.description, String(req.value ?? ""), req.quote]),
      ...input.analysis.results.flatMap((r) => [r.reason, r.evidence ?? ""]),
    ].join("\n"),
  );
  if (invented.length > 0)
    warnings.push(
      `The draft mentions figures not found in the company facts: ${invented.join(", ")}. Verify them before submitting.`,
    );

  const sections: DraftSection[] = [
    { key: "presentazione", title: "Presentazione dell'azienda", body: withFooter(out.data.presentazione) },
    { key: "esperienza", title: "Esperienza pertinente", body: withFooter(out.data.esperienza) },
    { key: "piano", title: "Piano di esecuzione", body: withFooter(out.data.piano) },
    {
      key: "conformita",
      title: "Dichiarazione di conformità",
      body: withFooter(complianceBody(input.analysis.tenderId, input.requirements, input.analysis.results)),
    },
  ];
  return {
    status: "draft",
    language: input.language ?? "it",
    sections,
    warnings,
    generatedBy: {
      model: out.model,
      ms: out.ms,
      ...(out.promptTokens !== undefined ? { promptTokens: out.promptTokens } : {}),
      ...(out.completionTokens !== undefined ? { completionTokens: out.completionTokens } : {}),
    },
  };
}
