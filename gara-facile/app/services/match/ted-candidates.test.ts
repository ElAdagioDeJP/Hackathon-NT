import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTedSearchRequest,
  noticeToContractModel,
  placeCountriesFor,
} from "./ted-candidates";
import type { BusinessModel } from "./types";
import type { TedNotice } from "../TED/types";

const business: BusinessModel = {
  name: "Voltio",
  country: "ESP",
  city: "Valencia",
  offerings: "Electrical works",
  coverageScope: "national",
  coverageCountries: [],
  capacity: "8 people",
  experienceLevel: "experienced",
  experience: "Public lighting",
};

test("TED query uses home country for local/national coverage", () => {
  const request = buildTedSearchRequest(business);
  assert.match(request.query, /place-of-performance IN \(ESP\)/);
  assert.equal(request.scope, "ACTIVE");
  assert.equal(request.limit, 20);
});

test("international coverage uses selected countries", () => {
  assert.deepEqual(
    placeCountriesFor({
      ...business,
      coverageScope: "international",
      coverageCountries: ["ITA", "FRA"],
    }),
    ["ITA", "FRA"],
  );
});

test("maps TED notices into Contract Models", () => {
  const notice = {
    "publication-number": "123-2026",
    "notice-type": "cn-standard",
    links: { htmlDirect: { ENG: "https://ted.example/123" } },
    "contract-title": { eng: "Street lighting upgrade" },
    "description-proc": { eng: "Replace lamps" },
    "classification-cpv": ["45316100"],
    "place-of-performance-country-proc": ["ESP"],
    "deadline-receipt-tender-date-lot": ["2026-12-01"],
    "buyer-name": { eng: ["City of Valencia"] },
  } satisfies TedNotice;

  const model = noticeToContractModel(notice);
  assert.equal(model.id, "123-2026");
  assert.equal(model.title, "Street lighting upgrade");
  assert.equal(model.url, "https://ted.example/123");
  assert.deepEqual(model.cpvCodes, ["45316100"]);
  assert.equal(model.deadline, "2026-12-01");
  assert.equal(model.buyerName, "City of Valencia");
});
