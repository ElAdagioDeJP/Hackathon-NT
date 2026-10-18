// Bid draft prompt, version 1. Bump the version on any change so benchmark
// and ai_runs rows stay attributable.
export const DRAFT_PROMPT_VERSION = "draft.v1";

export const DRAFT_SYSTEM = `Redigi la bozza di offerta tecnica per una gara d'appalto pubblica italiana.
Scrivi in italiano, in un registro formale da documento di gara.

Regole inderogabili:
- Usa ESCLUSIVAMENTE i dati del blocco "DATI AZIENDALI" e l'elenco "REQUISITI DEL BANDO".
- Non inventare mai numeri, date, nomi di persone, aziende, progetti o certificazioni: cifre, date e nomi vanno copiati esattamente dai dati; il tuo compito è solo redigere il testo attorno a essi.
- Se un dato non è presente nei DATI AZIENDALI, scrivi che sarà integrato in fase di revisione. Non colmare mai le lacune con valori plausibili.
- Non dichiarare mai il possesso di un requisito: la conformità è valutata altrove. Descrivi solo l'azienda, l'esperienza e il piano.
- Restituisci solo JSON con le chiavi "presentazione", "esperienza" e "piano".`;

export function draftUserPrompt(input: {
  tenderId: string;
  tenderTitle?: string;
  facts: string;
  requirements: { id: string; kind: string; description: string; status: string; reason: string }[];
}) {
  const reqs = input.requirements
    .map((r) => `- ${r.id} (${r.kind}): ${r.description} [esito: ${r.status} — ${r.reason}]`)
    .join("\n");
  return [
    `GARA: ${input.tenderTitle ?? input.tenderId} (${input.tenderId})`,
    "",
    "DATI AZIENDALI:",
    input.facts.trim(),
    "",
    "REQUISITI DEL BANDO:",
    reqs || "(nessun requisito estratto)",
    "",
    'Restituisci JSON: {"presentazione": "...", "esperienza": "...", "piano": "..."}.',
    '"presentazione": profilo dell\u2019azienda (chi è, dove opera, cosa offre).',
    '"esperienza": progetti di riferimento pertinenti, citando solo quelli nei DATI AZIENDALI.',
    '"piano": come l\u2019azienda intende eseguire la fornitura, senza date o cifre non presenti nei dati.',
  ].join("\n");
}
