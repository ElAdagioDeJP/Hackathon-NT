import assert from "node:assert/strict";
import { test } from "node:test";
import { createMatchService } from "./find-matches";
import { candidates, complete, fixture } from "./test-fixture";

test("stored matches carry the run time, so kept results read as the last run", async () => {
  const f = fixture();
  try {
    const token = f.profiles.save(undefined, complete, true, true).newToken!;
    const before = Date.now() - 1000;
    const first = await createMatchService(f.db, {
      searchNotices: async () => [candidates[0]],
      requestMatches: async () =>
        JSON.stringify([{ contractId: "TED-A", type: "exact", score: 80, rationale: "Fit." }]),
    }).findMatches(token);
    const matchedAt = first[0].matchedAt!;
    assert.ok(Date.parse(matchedAt) >= before && Date.parse(matchedAt) <= Date.now());

    const empty = createMatchService(f.db, { searchNotices: async () => [] });
    await assert.rejects(() => empty.findMatches(token), /No active TED notices/);
    const kept = empty.list(token);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].matchedAt, matchedAt);
  } finally {
    f.sqlite.close();
  }
});
