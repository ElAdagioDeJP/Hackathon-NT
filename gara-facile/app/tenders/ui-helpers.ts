import type { BidDraft } from "@/app/services/ai/draft";

// DRAFT_FOOTER value copied from app/services/ai/draft.ts ("Generato con IA — da revisionare").
// That module imports the LLM client and must stay out of the client bundle,
// so the constant is duplicated here instead of imported.
const DRAFT_FOOTER = "Generato con IA — da revisionare";

function bodyError(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "error" in body) {
    const message = (body as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return null;
}

export function friendlyError(
  status: number,
  body: unknown,
  retryAfter: string | null,
): string {
  if (status === 429) {
    const seconds = retryAfter !== null ? Number(retryAfter) : NaN;
    if (Number.isFinite(seconds) && seconds > 0)
      return `Too many requests. Try again in ${Math.ceil(seconds)} seconds.`;
    return "Too many requests. Try again in a minute.";
  }
  if (status === 401 || status === 403)
    return "Your profile session expired. Open your business profile again.";
  if (status === 404) return bodyError(body) ?? "Not found.";
  if (status === 502 || status === 503)
    return "The AI service is busy right now. Try again shortly.";
  return bodyError(body) ?? "Something went wrong. Try again.";
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  let body: unknown = null;
  try {
    body = (await response.json()) as unknown;
  } catch {
    body = null;
  }
  if (!response.ok)
    throw new Error(
      friendlyError(response.status, body, response.headers.get("retry-after")),
    );
  return body as T;
}

export function decodeEntities(text: string): string {
  const fromHex = (match: string, hex: string): string => {
    try {
      const codePoint = Number.parseInt(hex, 16);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff)
        return match;
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  };
  const fromDec = (match: string, dec: string): string => {
    try {
      const codePoint = Number.parseInt(dec, 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff)
        return match;
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  };
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, fromHex)
    .replace(/&#([0-9]+);/g, fromDec)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function draftToText(title: string, draft: BidDraft): string {
  const sections = draft.sections
    .map((section) => `${section.title}\n\n${section.body}`)
    .join("\n\n");
  const base = `${title}\n\n${sections}`;
  if (base.trimEnd().endsWith(DRAFT_FOOTER)) return base;
  return `${base}\n\n${DRAFT_FOOTER}`;
}
