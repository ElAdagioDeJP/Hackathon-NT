import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEvolusMatchResponse } from "./parse-matches";
import type { ContractModel } from "./types";

const contracts: ContractModel[] = [
  {
    id: "TED-1",
    title: "One",
    url: "https://example.test/1",
    description: "",
    placeCountries: ["ESP"],
    cpvCodes: [],
    deadline: null,
    buyerName: null,
  },
  {
    id: "TED-2",
    title: "Two",
    url: "https://example.test/2",
    description: "",
    placeCountries: ["ESP"],
    cpvCodes: [],
    deadline: null,
    buyerName: null,
  },
];

test("rejects duplicate ids and values that only coerce into valid ones", () => {
  const row = (overrides: Record<string, unknown>) => ({
    contractId: "TED-2",
    type: "none",
    score: 0,
    rationale: "no",
    ...overrides,
  });
  const parse = (...rows: Record<string, unknown>[]) =>
    parseEvolusMatchResponse(
      JSON.stringify({ matches: [row({ contractId: "TED-1", type: "exact", score: 90, rationale: "ok" }), ...rows] }),
      contracts,
      1,
    );
  assert.throws(() => parse(row({}), row({ score: 80 })), /more than once/);
  assert.throws(() => parse(row({ contractId: "TED-1" }), row({})), /more than once/);
  for (const score of [null, "", "50", true, []])
    assert.throws(() => parse(row({ score })), /0 to 100/, String(score));
  for (const rationale of [{ text: "x" }, ["x"], 42])
    assert.throws(() => parse(row({ rationale })), /Rationale/);
  assert.throws(() => parse(row({ type: ["none"] })), /Invalid match type/);
  assert.throws(() => parse(row({ contractId: { id: "TED-2" } })), /contractId/);
  assert.equal(parse(row({})).length, 2);
});
