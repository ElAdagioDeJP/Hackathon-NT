// Deterministic threshold normalization shared by extraction and rules.

// "€1.500.000", "1,500,000.00 EUR", "1.5 milioni", "€ 750k" → number of euros.
export function parseAmount(input: unknown): number | undefined {
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;
  if (typeof input !== "string") return undefined;
  const text = input.toLowerCase().replace(/\s+/g, " ");
  const match = text.match(/(\d[\d.,' ]*\d|\d)/);
  if (!match) return undefined;
  let digits = match[1].replace(/[' ]/g, "");
  const lastDot = digits.lastIndexOf(".");
  const lastComma = digits.lastIndexOf(",");
  const decimalAt = Math.max(lastDot, lastComma);
  // A separator followed by exactly 3 digits is a thousands separator.
  if (decimalAt >= 0 && digits.length - decimalAt - 1 !== 3) {
    digits =
      digits.slice(0, decimalAt).replace(/[.,]/g, "") +
      "." +
      digits.slice(decimalAt + 1);
  } else {
    digits = digits.replace(/[.,]/g, "");
  }
  let value = Number(digits);
  if (!Number.isFinite(value)) return undefined;
  const rest = text.slice((match.index ?? 0) + match[1].length);
  if (/^\s*(mln|milion|million|millones|mio\b|m\b)/.test(rest)) value *= 1_000_000;
  else if (/^\s*(k\b|mila\b|mil\b|thousand)/.test(rest)) value *= 1_000;
  return value;
}

// "2%", "2 %", 2 (percent), 0.02 (fraction) → fraction.
export function parsePercent(input: unknown): number | undefined {
  if (typeof input === "number") return input > 1 ? input / 100 : input;
  if (typeof input !== "string") return undefined;
  const match = input.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return input.includes("%") || value > 1 ? value / 100 : value;
}

const DAY_UNITS: [RegExp, number][] = [
  [/(giorn|day|día|dia|jour|tag)/, 1],
  [/(settiman|week|semana|semaine|woche)/, 7],
  [/(mes|mese|month|mois|monat)/, 30],
  [/(ann|year|año|an\b|jahr)/, 365],
];

// "90 giorni", "6 mesi", "90 days", 90 → days.
export function parseDays(input: unknown): number | undefined {
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;
  if (typeof input !== "string") return undefined;
  const text = input.toLowerCase();
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return undefined;
  const value = Number(match[1].replace(",", "."));
  const unit = text.slice((match.index ?? 0) + match[1].length);
  const factor = DAY_UNITS.find(([pattern]) => pattern.test(unit))?.[1] ?? 1;
  return Math.round(value * factor);
}

// Lowercase, strip accents and collapse whitespace for literal quote checks.
export function canonical(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
