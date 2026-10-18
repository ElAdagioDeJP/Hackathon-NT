import assert from "node:assert/strict";
import { test } from "node:test";
import { createMatchStore } from "./store";
import { candidates, fixture } from "./test-fixture";

test("a contract batch that fails part way leaves no rows behind", () => {
  const f = fixture();
  try {
    const store = createMatchStore(f.db);
    const broken = { ...candidates[1], title: null as unknown as string };
    assert.throws(() => store.upsertContracts([candidates[0], broken]));
    assert.equal(
      (f.sqlite.prepare("SELECT count(*) AS c FROM contracts").get() as { c: number }).c,
      0,
    );
  } finally {
    f.sqlite.close();
  }
});
