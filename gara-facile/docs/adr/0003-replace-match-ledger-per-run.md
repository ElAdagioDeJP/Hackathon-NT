# Replace the match ledger per Find matches run

A successful Matching run deletes existing `contract_matches` (and dependent submissions) for that business profile version, then inserts the new batch. Upsert-per-contract would leave stale notices from earlier TED pages in the ledger. Latest run wins for the whole Match ledger of that version.
