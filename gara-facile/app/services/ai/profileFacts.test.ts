import assert from "node:assert/strict";
import { test } from "node:test";
import {
  demoCompanyFacts,
  getCompanyFacts,
  toCompanyFacts,
  type ProfileFactsInput,
} from "./profileFacts";

function input(overrides: Partial<ProfileFactsInput> = {}): ProfileFactsInput {
  return {
    business: { name: "Acme S.r.l.", country: "IT", city: "Milano" },
    record: {
      id: 7,
      offerings: "Web platforms for SMEs.",
      cpvCodes: ["72000000"],
      certifications: ["ISO 9001", "ISO 27001"],
      languages: ["it"],
    },
    documents: [
      {
        originalName: "iso-9001_certificate.pdf",
        category: "legal",
        expiresAt: "2027-06-30T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

test("getCompanyFacts without id returns the demo company", async () => {
  const facts = await getCompanyFacts();
  assert.equal(facts.name, "Nordest Software S.r.l.");
  assert.ok(
    facts.certifications.some(
      (c) => c.name.includes("ISO 9001") && c.hasDocument,
    ),
  );
  assert.equal(
    facts.certifications.some((c) => c.name.includes("ISO 27001")),
    false,
  );
  assert.equal(facts.annualTurnover.length, 3);
});

test("demoCompanyFacts returns independent copies", () => {
  const a = demoCompanyFacts();
  const b = demoCompanyFacts();
  a.name = "Changed";
  a.cpvCodes.push("00000000");
  a.certifications[0].name = "Changed";
  a.annualTurnover[0].amountEur = 0;
  assert.equal(b.name, "Nordest Software S.r.l.");
  assert.equal(b.cpvCodes.includes("00000000"), false);
  assert.equal(b.certifications[0].name.includes("ISO 9001"), true);
  assert.notEqual(b.annualTurnover[0].amountEur, 0);
});

test("toCompanyFacts matches certifications against document names", () => {
  const facts = toCompanyFacts(input());
  const iso9001 = facts.certifications.find((c) => c.name === "ISO 9001")!;
  const iso27001 = facts.certifications.find((c) => c.name === "ISO 27001")!;
  assert.equal(iso9001.hasDocument, true);
  assert.equal(iso9001.expiresAt, "2027-06-30");
  assert.equal(iso27001.hasDocument, false);
  assert.equal("expiresAt" in iso27001, false);
});

test("toCompanyFacts falls back to demo for empty lists and financial fields", () => {
  const demo = demoCompanyFacts();
  const facts = toCompanyFacts(
    input({
      record: {
        id: 7,
        offerings: "  ",
        cpvCodes: [],
        certifications: ["ISO 9001"],
        languages: [],
      },
    }),
    demo,
  );
  assert.equal(facts.offerings, demo.offerings);
  assert.deepEqual(facts.cpvCodes, demo.cpvCodes);
  assert.deepEqual(facts.languages, demo.languages);
  assert.equal(facts.employees, demo.employees);
  assert.equal(facts.isSme, demo.isSme);
  assert.equal(facts.bidGuaranteeCapacityEur, demo.bidGuaranteeCapacityEur);
  assert.equal(facts.maxExecutionDays, demo.maxExecutionDays);
  assert.deepEqual(facts.referenceProjects, demo.referenceProjects);
  assert.deepEqual(facts.annualTurnover, demo.annualTurnover);
});

test("toCompanyFacts matches certification names ignoring punctuation", () => {
  const facts = toCompanyFacts({
    business: { name: "Example S.r.l.", country: "IT", city: "Verona" },
    record: { id: 7, offerings: "Web apps", cpvCodes: [], certifications: ["ISO 9001:2015"], languages: [] },
    documents: [{ originalName: "ISO_9001_2015.pdf", category: "legal", expiresAt: null }],
  });
  assert.equal(facts.certifications[0].hasDocument, true);
  assert.equal(facts.certifications[0].expiresAt, undefined);
});
