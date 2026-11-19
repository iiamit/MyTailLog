import { test } from "node:test";
import assert from "node:assert/strict";
import { adPhrase, equipmentVerdict, intervalPhrase } from "../src/lib/v2/equipment";
import { registryRows, tailMatches } from "../src/lib/v2/details";

test("equipment copy (W-AIRCRAFT-03)", () => {
  assert.equal(intervalPhrase(100, null), "every 100 hours");
  assert.equal(intervalPhrase(1, 12), "every 1 hour or 12 months");
  assert.equal(intervalPhrase(null, null), null);
  const ad = { reference: "2011-10-09", kind: "ad", status: "complied", recurring: true, interval_hours: 100, interval_months: null };
  assert.equal(adPhrase(ad), "AD 2011-10-09 every 100 hours");
  assert.equal(adPhrase({ ...ad, status: "not_applicable" }), "AD 2011-10-09 not applicable");
  assert.equal(adPhrase({ ...ad, recurring: false, kind: "sb", status: "open" }), "SB 2011-10-09, open");
  assert.equal(equipmentVerdict(12, 3, 0), "12 parts installed, 3 removed.");
  assert.equal(equipmentVerdict(1, 0, 2), "1 part installed, 0 removed. 2 more turned up in the logbooks and need your answer.");
});

test("registry compare ignores case and punctuation; blanks differ (W-AIRCRAFT-05)", () => {
  const rec = {
    tailNumber: "N734QA", make: "CESSNA", model: "172N", serialNumber: "17270123", year: 1978,
    engineMake: "LYCOMING", engineModel: "O-320-H2AD", registrantName: "DOE JANE", status: "Valid", modeSCodeHex: "a9c1f2",
  };
  const { rows, agree, compared } = registryRows({ make: "Cessna", model: "172 N", serial_number: null, year: 1979 }, rec);
  assert.equal(compared, 4);
  assert.equal(agree, 2);
  assert.deepEqual(rows.filter((r) => r.differs).map((r) => r.field), ["serial_number", "year"]);
  assert.equal(rows.find((r) => r.label === "Mode S code")?.theirs, "A9C1F2 (hex)");
});

test("delete needs the typed tail", () => {
  assert.ok(tailMatches(" n734qa ", "N734QA"));
  assert.ok(!tailMatches("N734Q", "N734QA"));
  assert.ok(!tailMatches("", ""));
});
