# Extraction benchmark

Generated: 2026-10-18. Command: `bun run bench`.
Labels: JP (hand-labeled from the disciplinare PDFs) (2026-10-17), 14 requirements across 3 tenders.
Company: `fixtures/company/demo-company.json`. Reference "today" for deadline rules: 2026-10-17.
Extract prompt version in code: `extract.v2`; in fixtures: `extract.v2`.
Model(s): `Gemma-4-31B-IT` (via AMD Token Factory; the endpoint reports it as `self-dploy/Gemma-4-31B-IT`).

Method: a labeled requirement matches an extracted one when the kind is equal
and |page difference| <= 1; each extracted item matches at most one label
(greedy by smallest page distance). Precision = matched / extracted,
recall = matched / labeled. Verdicts and requirement decisions come from
`evaluateAll` + `score`/`verdict` in `app/services/ai`, exactly as
`analyzeTender` wires them. Timing is the saved extraction stats (no new run).

Sample is small (14 labels, 3 tenders): treat every percentage as indicative, not significant.

## Overall precision / recall

| Metric | Value |
| --- | --- |
| Precision | 0.68 (13/19) |
| Recall | 0.93 (13/14) |

## Per kind

| Kind | Precision | Recall | Matched / extracted / labeled |
| --- | --- | --- | --- |
| bid_guarantee | 1.00 | 1.00 | 3 / 3 / 3 |
| certification | 0.67 | 1.00 | 4 / 6 / 4 |
| execution_deadline | 1.00 | 1.00 | 1 / 1 / 1 |
| min_turnover | 0.75 | 1.00 | 3 / 4 / 3 |
| similar_projects | 1.00 | 0.67 | 2 / 2 / 3 |
| submission_deadline | 0.00 | n/a | 0 / 3 / 0 |

## Per tender

| Tender | Precision | Recall | Verdict expected | Verdict computed | Score | Verdict match |
| --- | --- | --- | --- | --- | --- | --- |
| 629600-2026 | 0.50 (3/6) | 1.00 (3/3) | NO_GO | NO_GO | 13 | yes |
| 687674-2026 | 1.00 (3/3) | 1.00 (3/3) | GO | GO | 100 | yes |
| 691579-2026 | 0.70 (7/10) | 0.88 (7/8) | NO_GO | NO_GO | 53 | yes |

Verdict accuracy: 3/3.

## Requirement-level decision accuracy

Rules status of the extracted requirement vs the labeled expectation, over matched pairs: 13/13 (1.00).

| Tender | Label | Extracted | Expected | Computed | Correct |
| --- | --- | --- | --- | --- | --- |
| 629600-2026 | 629600-turnover (min_turnover, p10) | min_turnover-1 (p10) | FAILS | FAILS | yes |
| 629600-2026 | 629600-similar (similar_projects, p10) | similar_projects-1 (p10) | FAILS | FAILS | yes |
| 629600-2026 | 629600-guarantee (bid_guarantee, p11) | bid_guarantee-1 (p11) | FAILS | FAILS | yes |
| 687674-2026 | 687674-turnover (min_turnover, p15) | min_turnover-1 (p15) | MEETS | MEETS | yes |
| 687674-2026 | 687674-delivery (execution_deadline, p11) | execution_deadline-1 (p11) | MEETS | MEETS | yes |
| 687674-2026 | 687674-guarantee (bid_guarantee, p21) | bid_guarantee-1 (p21) | MEETS | MEETS | yes |
| 691579-2026 | 691579-turnover (min_turnover, p16) | min_turnover-1 (p16) | MEETS | MEETS | yes |
| 691579-2026 | 691579-similar (similar_projects, p17) | similar_projects-1 (p17) | FAILS | FAILS | yes |
| 691579-2026 | 691579-iso9001 (certification, p17) | certification-1 (p17) | MEETS | MEETS | yes |
| 691579-2026 | 691579-iso27001 (certification, p17) | certification-2 (p17) | FAILS | FAILS | yes |
| 691579-2026 | 691579-iso14001 (certification, p17) | certification-3 (p17) | FAILS | FAILS | yes |
| 691579-2026 | 691579-sa8000 (certification, p17) | certification-4 (p17) | FAILS | FAILS | yes |
| 691579-2026 | 691579-guarantee (bid_guarantee, p21) | bid_guarantee-1 (p21) | MEETS | MEETS | yes |

## Missed labels (no extracted match)

- 691579-specific (similar_projects, p16): Fatturato complessivo per servizi analoghi

## Extra extracted (no label)

- 629600-2026 certification-1 (certification, p9): Essere Partner certificati Oracle per gli ambiti oggetto dell’affidamento.
- 629600-2026 certification-2 (certification, p10): Essere Partner certificati Microsoft.
- 629600-2026 submission_deadline-1 (submission_deadline, p16): Termine ultimo per la presentazione delle offerte.
- 691579-2026 submission_deadline-1 (submission_deadline, p1): Data scadenza per la presentazione dell'offerta.
- 691579-2026 min_turnover-2 (min_turnover, p16): Fatturato relativo a servizi analoghi maturato nel triennio precedente.
- 691579-2026 submission_deadline-2 (submission_deadline, p23): Termine perentorio per la presentazione dell'offerta e della documentazione.

## Value mismatches (matched, numeric value differs)

None.

## Timing (saved extraction stats)

| Tender | Model | ms | Prompt tokens | Completion tokens | Completion tok/s | Total tok/s |
| --- | --- | --- | --- | --- | --- | --- |
| 629600-2026 | `self-dploy/Gemma-4-31B-IT` | 39662 | 32693 | 722 | 18.2 | 842.5 |
| 687674-2026 | `self-dploy/Gemma-4-31B-IT` | 53837 | 45333 | 593 | 11.0 | 853.1 |
| 691579-2026 | `self-dploy/Gemma-4-31B-IT` | 81574 | 60388 | 1002 | 12.3 | 752.6 |

`Model` here is the endpoint-reported name; the configured model is `Gemma-4-31B-IT` (same figures as the root README run table).

## Analysis from saved requirements

`analyzeTender` reuses the reviewed requirements in `fixtures/tenders/<tenderId>.requirements.json`; live extraction runs only as fallback. Analysis from saved requirements answers in about 0.3 s (the ms/tokens above are the saved live-extraction stats, not a new run per analysis).

## Bid draft on AMD

One real bid draft via `POST /api/ai/draft` (Gemma-4-31B-IT on AMD Token Factory): 53,149 ms, 1,010 prompt tokens, 408 completion tokens.

## Why saved requirements

Live Gemma extraction once found only 1 of 6 requirements on one tender and produced a false GO; reviewed saved requirements keep the verdict stable, which is why the app prefers them.
