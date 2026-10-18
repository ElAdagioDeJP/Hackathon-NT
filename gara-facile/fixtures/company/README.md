# Demo company — Nordest Software S.r.l. (fictional)

`demo-company.json` is a `CompanyFacts` object (see `app/services/ai/_contract.mock.ts`, later `types.ts`).
`getCompanyFacts()` returns it only when there is no database or no `businessRecordId`. A real profile
never borrows its figures: fields the profile UI does not collect yet stay empty and the rules report
`MISSING_DOC`. All names and figures are fictional.

## Calibration for the 3 demo tenders (2 red, 1 green)

| Fact | Value |
|---|---|
| Certifications | ISO 9001:2015 valid until 2027-06-30, document uploaded · **no ISO/IEC 27001** |
| Turnover 2023 / 2024 / 2025 | €1.15M / €1.32M / €1.48M (average ≈ €1.32M) |
| Public reference projects | 3 (€95k–€240k, 2023–2025) |
| Bid guarantee capacity | €60,000 |
| Max execution time | 60 days |

Suggested tender thresholds:
- **Green:** ISO 9001 · average turnover ≥ €1,000,000 · ≥ 2 similar public projects · guarantee 2 % of €2M (= €40k) · execution ≤ 180 days.
- **Red A:** requires **ISO/IEC 27001** → `FAILS` (no certification, no document).
- **Red B:** minimum annual turnover **€3,000,000** → `FAILS`.
