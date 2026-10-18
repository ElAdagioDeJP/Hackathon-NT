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

test("parses fenced JSON and preserves candidate order", () => {
  const content = `Here you go:
\`\`\`json
{"matches":[
  {"contractId":"TED-2","type":"partial","score":40,"rationale":"Related work"},
  {"contractId":"TED-1","type":"exact","score":90,"rationale":"Direct fit"}
]}
\`\`\``;
  const matches = parseEvolusMatchResponse(content, contracts, 7);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].contractId, "TED-1");
  assert.equal(matches[0].type, "exact");
  assert.equal(matches[0].businessRecordId, 7);
  assert.equal(matches[1].contractId, "TED-2");
});

test("rejects missing contracts, bad scores and unknown ids", () => {
  assert.throws(
    () =>
      parseEvolusMatchResponse(
        JSON.stringify({
          matches: [
            {
              contractId: "TED-1",
              type: "exact",
              score: 10,
              rationale: "ok",
            },
          ],
        }),
        contracts,
        1,
      ),
    /omitted contract TED-2/,
  );
  assert.throws(
    () =>
      parseEvolusMatchResponse(
        JSON.stringify({
          matches: [
            {
              contractId: "TED-1",
              type: "exact",
              score: 101,
              rationale: "ok",
            },
            {
              contractId: "TED-2",
              type: "none",
              score: 0,
              rationale: "no",
            },
          ],
        }),
        contracts,
        1,
      ),
    /0 to 100/,
  );
});

test("ignores prose around the JSON payload, even with brackets inside strings", () => {
  const json = JSON.stringify({
    matches: [
      { contractId: "TED-1", type: "exact", score: 90, rationale: "Fits {all} [criteria]" },
      { contractId: "TED-2", type: "none", score: 0, rationale: "Unrelated \"catering\"" },
    ],
  });
  for (const content of [
    `${json}\nLet me know if you need more detail.`,
    `Here are the results: ${json} Hope this helps [1].`,
    `Results:\n${json}\n\nNote: scores are 0-100 {approx}.`,
  ]) {
    const matches = parseEvolusMatchResponse(content, contracts, 1);
    assert.equal(matches.length, 2);
    assert.equal(matches[0].rationale, "Fits {all} [criteria]");
  }
  assert.throws(
    () => parseEvolusMatchResponse('{"matches": [', contracts, 1),
    /valid JSON/,
  );
});
