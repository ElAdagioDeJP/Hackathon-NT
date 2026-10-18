# Matching agent (Evolus)

Configure one Evolus agent in your hackathon workspace to perform **Matching**. Gara Facile calls it through the OpenAI-compatible chat API and validates the JSON reply.

## Environment

```bash
EVOLUS_API_KEY=
EVOLUS_APP_ID=
EVOLUS_AGENT_ID=
# Matching agent used by Find matches (falls back to EVOLUS_AGENT_ID when unset)
EVOLUS_MATCH_AGENT_ID=
# Optional override; default https://api.evolus.ai/v1
EVOLUS_BASE_URL=
EU_API_KEY=
```

`model` is sent as `${EVOLUS_APP_ID}:${EVOLUS_MATCH_AGENT_ID}` (the *matching* agent id, not the assistant's) for this flow. Each Find matches run is a new conversation (no `X-Conversation-Id`).

## Expected JSON contract

The agent must reply with JSON only (a fenced ```json block is accepted):

```json
{
  "matches": [
    {
      "contractId": "123456-2026",
      "type": "exact",
      "score": 86,
      "rationale": "Short explanation in English."
    }
  ]
}
```

Rules:

- Include **exactly one** object per `contractId` in the candidate set.
- `type` is `exact`, `partial`, or `none`.
- `score` is an integer from `0` to `100`.
- `rationale` is a non-empty short explanation in English.

## Suggested agent instructions

Paste into the Evolus Matching agent (adjust tone as needed):

> You compare one Business Model to a Candidate set of public procurement Contract Models from TED.
> Judge fit using offerings, coverage, capacity, and experience against each contract’s title, description, place, CPV codes, and deadline.
> Return JSON only in the shape `{"matches":[{"contractId","type","score","rationale"}]}`.
> Use `exact` for strong direct fit, `partial` for plausible but incomplete fit, `none` when the notice is not relevant.
> Score 0–100 consistently with the type. Write concise English rationales. Do not invent contract IDs.

## Runtime flow

1. User approves a business profile, then clicks **Find matches**.
2. App queries TED (active notices, place-of-performance from coverage, limit 20).
3. App upserts Contract Models, then calls the Matching agent once with Business Model + Candidate set.
4. On a valid reply, the app replaces that profile version’s match ledger.
5. If Evolus fails after TED succeeds, contracts may remain stored; the previous ledger is left unchanged.
