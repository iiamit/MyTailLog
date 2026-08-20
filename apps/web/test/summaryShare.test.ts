import { test } from "node:test";
import assert from "node:assert/strict";
import { maintenanceSummaryText } from "../src/lib/summaryShare";

test("maintenance summary share text is useful, bounded, and omits private detail", () => {
  const text = maintenanceSummaryText({
    tailNumber: "N734DM", description: "1978 Cessna 172N", generated: "2026-08-20",
    meters: ["tach 2214.7"], overdue: 1, dueSoon: 2, current: 4, openSquawks: 1,
    adCount: 8, equipmentCount: 12, weightBalance: "Weight & balance: empty 1450 lbs · useful load 850 lbs",
    attention: Array.from({ length: 22 }, (_, i) => ({
      label: `Item ${i + 1}`, status: "Overdue", nextDue: "2026-08-01", remaining: "19 days overdue",
    })),
  });
  assert.match(text, /N734DM — maintenance summary/);
  assert.match(text, /1 overdue · 2 due soon/);
  assert.match(text, /• …and 2 more/);
  assert.doesNotMatch(text, /serial|reporter|scan/i);
  assert.match(text, /Verify against the physical aircraft records/);
});
