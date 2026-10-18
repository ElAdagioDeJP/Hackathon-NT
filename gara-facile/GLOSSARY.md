# Gara Facile

Language for matching approved business profiles to European public procurement opportunities.

## Language

**Match module**:
The part of the system that fetches candidate contracts from TED, runs Matching via Evolus, and stores Match Models. It does not prepare submissions.
_Avoid_: Matcher service, AI pipeline, recommendation engine

**Matching**:
An Evolus judgment that compares one Business Model to one or more Contract Models and produces Match Models.
_Avoid_: Scoring (alone), ranking, eligibility check, AI analysis (vague)

**Find matches**:
The explicit action, available after a business profile is approved, that starts Matching. Approval alone does not start Matching.
_Avoid_: Auto-match, sync, cron match

**Match Model**:
The stored result of Matching for one Business Model and one Contract Model: match type (`exact`, `partial`, or `none`), score from 0 to 100, and a short rationale.
_Avoid_: Recommendation, hit, opportunity score

**Business Model** (for Matching):
The approved profile fields used as Evolus input: name, country, city, offerings, coverage, capacity, and experience. The company sheet synced to the Company KB also carries the profile documents (library sync uploads the facts sheet plus the profile's documents).
_Avoid_: Business profile draft, SavedProfile (implementation names)

**Contract Model**:
The normalized view of a TED notice used for Matching and storage: identity, title, link, and the matching-relevant attributes taken from the notice (at least place, description/title text, CPV when present, deadlines when present).
_Avoid_: TedNotice (raw API shape), eForms blob

**Candidate set**:
The batch of Contract Models produced by one TED search for a Find matches run (v1: up to 20 active notices filtered by place of performance).
_Avoid_: Search results, TED page, opportunities list

**Matching agent**:
The Evolus agent configured in the workspace (instructions, model, tools) that performs Matching when called through the OpenAI-compatible chat API.
_Avoid_: LLM, chatbot, digital employee (unless referring to the portal concept)

**Match ledger**:
The set of Match Models stored for one approved business profile version. Each successful Find matches run replaces the entire ledger for that version.
_Avoid_: Match history, recommendations list

**Compliance matrix**:
The per-tender table that checks each extracted requirement against the company facts with fixed rules. Statuses are `MEETS`, `FAILS` or `MISSING_DOC`; every row carries the page and the literal quote it came from.
_Avoid_: Eligibility check (done by the model), AI verdict

**Requirement kinds**:
The six fixed requirement types the rule engine understands: `certification`, `min_turnover`, `bid_guarantee`, `similar_projects`, `execution_deadline`, `submission_deadline`.
_Avoid_: Free-form labels, AI categories

**Verdict**:
The deterministic outcome of the rule engine for a tender: `GO` (all MEETS), `REVIEW` (has MISSING_DOC), `NO_GO` (any FAILS), with a score from 0 to 100. The model never decides eligibility.
_Avoid_: AI decision, recommendation

**Bid draft**:
The editable offer text generated in Italian by Gemma on AMD from the saved analysis and the company facts (`POST /api/ai/draft`). Every section ends with `Generato con IA — da revisionare`; a person approves it (Approve / Edit again) before anything leaves the system, and it can be downloaded as .txt.
_Avoid_: Auto-sent offer, final bid

**Evolus second opinion**:
The Evolus extractor's reading of the same tender PDF (`GET /api/ai/evolus/extract`), shown next to ours in the _Evolus vs our extractor_ box for comparison. It never overrides the rule engine.
_Avoid_: Ground truth, override

**AMD panel**:
The _Running on AMD_ box in `/tenders` plus `GET /api/ai/amd-stats`: what already ran on AMD (calls, ms, tokens/s per role, GPU label). It reports past runs; it never calls the provider.
_Avoid_: Live GPU monitor, cost dashboard

**Demo company**:
Nordest Software S.r.l. (`fixtures/company/demo-company.json`), the fictional company used for analysis when no profile cookie is present. `/tenders` shows a notice in that case. It is distinct from the Voltio Electrical example that fills the profile form.
_Avoid_: Real client, default profile
