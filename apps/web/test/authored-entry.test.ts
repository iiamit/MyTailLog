import assert from "node:assert/strict";
import { test } from "node:test";
import { issueEntryPrintToken, verifyEntryPrintToken } from "../src/lib/entry-print-token";
import { missingTemplateFields, templateWork } from "../src/lib/authored-entries";

test("oil template records supplied facts without inventing an inspection result", () => {
  const values = {
    oil: "Phillips XC 20W-50", quantity: "7 qt", filter: "Tempest AA48110-2",
    filter_findings: "No visible metal in pleats", instructions: "engine manual rev 4",
    checks: "run-up and leak check, no leaks observed",
  };
  assert.deepEqual(missingTemplateFields("oil_filter", values), []);
  const text = templateWork("oil_filter", values);
  assert.match(text, /7 qt of Phillips XC 20W-50/);
  assert.match(text, /No visible metal in pleats/);
  assert.doesNotMatch(text, /airworthy|approved for return to service/i);
  assert.deepEqual(missingTemplateFields("oil_filter", { ...values, filter_findings: "" }), ["Removed filter inspection findings"]);
});

test("a print link is scoped to one entry and expires", () => {
  process.env.ENCRYPTION_KEY = "entry-print-test-secret";
  const token = issueEntryPrintToken("entry-a", "user-a", 1_000_000);
  assert.equal(verifyEntryPrintToken(token, "entry-a", 1_000_001), true);
  assert.equal(verifyEntryPrintToken(token, "entry-b", 1_000_001), false);
  assert.equal(verifyEntryPrintToken(token, "entry-a", 1_600_001), false);
  assert.equal(verifyEntryPrintToken(`${token}x`, "entry-a", 1_000_001), false);
});
