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
The approved profile fields used as Evolus input: name, country, city, offerings, coverage, capacity, and experience. Documents and empty enrichment fields are out of scope for v1.
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
