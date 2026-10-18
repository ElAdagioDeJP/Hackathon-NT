import assert from "node:assert/strict";
import { test } from "node:test";
import { createMatchService } from "./find-matches";
import { candidates, complete, fixture } from "./test-fixture";

test("matches are discarded when the profile changes while Matching runs", async () => {
  const f = fixture();
  try {
    const token = f.profiles.save(undefined, complete, true, true).newToken!;
    const answer = JSON.stringify({
      matches: candidates.map((c) => ({
        contractId: c.id,
        type: "partial",
        score: 50,
        rationale: "Related.",
      })),
    });
    const service = createMatchService(f.db, {
      searchNotices: async () => candidates,
      requestMatches: async () => {
        // The owner edits the profile (back to draft) while Evolus is thinking.
        f.profiles.save(token, { ...complete, offerings: "Catering." }, true);
        return answer;
      },
    });
    await assert.rejects(() => service.findMatches(token), /changed while Matching/);
    assert.deepEqual(service.list(token), []);
  } finally {
    f.sqlite.close();
  }
});
