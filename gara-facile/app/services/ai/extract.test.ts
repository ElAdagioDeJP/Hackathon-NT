import assert from "node:assert/strict";
import { test } from "node:test";
import { extractRequirements, locateQuote, windows } from "./extract";
import type { TenderPage } from "./types";

const pages: TenderPage[] = [
  { page: 1, text: "Disciplinare di gara. Procedura aperta per servizi cloud.", needsOcr: false },
  { page: 2, text: "Gli operatori devono possedere la certificazione ISO/IEC 27001 in corso di validità.", needsOcr: false },
  { page: 3, text: "", needsOcr: true },
  {
    page: 4,
    text: "Fatturato globale minimo nel triennio pari a € 1.500.000,00 IVA esclusa.\nGaranzia provvisoria pari al 2% dell'importo a base d'asta.",
    needsOcr: false,
  },
];

const fakeChat = (requirements: unknown[]) =>
  (async () => ({
    content: "",
    data: { requirements },
    model: "qwen",
    ms: 1,
    promptTokens: 100,
    completionTokens: 20,
  })) as never;

test("windows skip OCR pages and keep page numbers", () => {
  const w = windows(pages, 2);
  assert.deepEqual(w.map((g) => g.map((p) => p.page)), [[1, 2], [4]]);
});

test("locateQuote tolerates whitespace and hyphenation, corrects the page", () => {
  assert.equal(locateQuote("certificazione ISO/IEC  27001", 2, pages), 2);
  assert.equal(locateQuote("Garanzia provvisoria pari al 2%", 1, pages), 4);
  assert.equal(locateQuote("certificazione ISO 14001", 2, pages), undefined);
  assert.equal(locateQuote("ISO", 2, pages), undefined);
});

test("drops unquoted or hallucinated requirements, normalizes and dedupes", async () => {
  const { requirements, stats } = await extractRequirements(pages, {
    chat: fakeChat([
      { kind: "certification", description: "ISO 27001", value: "ISO/IEC 27001", page: 2, quote: "certificazione ISO/IEC 27001", confidence: 0.9 },
      { kind: "certification", description: "ISO 27001 again", value: "iso/iec 27001", page: 2, quote: "possedere la certificazione ISO/IEC 27001", confidence: 0.6 },
      { kind: "min_turnover", description: "Fatturato globale triennio", value: "€ 1.500.000,00", page: 4, quote: "Fatturato globale minimo nel triennio pari a € 1.500.000,00", confidence: 0.8 },
      { kind: "bid_guarantee", description: "Garanzia 2%", value: "2%", page: 4, quote: "Garanzia provvisoria pari al 2%", confidence: 0.8 },
      { kind: "certification", description: "invented", value: "ISO 14001", page: 2, quote: "certificazione ISO 14001 obbligatoria", confidence: 0.9 },
      { kind: "submission_deadline", description: "no date", value: "presto", page: 1, quote: "Procedura aperta per servizi cloud", confidence: 0.5 },
    ]),
  });
  assert.deepEqual(
    requirements.map((r) => [r.id, r.page, r.value, r.unit]),
    [
      ["certification-1", 2, "ISO/IEC 27001", undefined],
      ["bid_guarantee-1", 4, 0.02, "%"],
      ["min_turnover-1", 4, 1_500_000, "EUR"],
    ],
  );
  assert.equal(requirements[0].confidence, 0.9);
  assert.equal(stats.droppedNoQuote, 1);
  assert.equal(stats.droppedBadValue, 1);
  assert.equal(stats.duplicates, 1);
});

test("a failed window is skipped; all windows failing rethrows", async () => {
  let call = 0;
  const flaky = (async () => {
    if (call++ === 0) throw new Error("timeout");
    return { content: "", data: { requirements: [] }, model: "qwen", ms: 1 };
  }) as never;
  const many = Array.from({ length: 14 }, (_, i) => ({ page: i + 1, text: "testo di prova della pagina", needsOcr: false }));
  const { stats } = await extractRequirements(many, { chat: flaky });
  assert.equal(stats.windows, 2);
  assert.equal(stats.failedWindows, 1);

  const broken = (async () => {
    throw new Error("down");
  }) as never;
  await assert.rejects(extractRequirements(many, { chat: broken }), /down/);
});
