import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EntrySticker } from "../src/components/EntrySticker";

test("signed sticker includes the physical logbook's identifying details and meters", () => {
  const html = renderToStaticMarkup(createElement(EntrySticker, {
    entry: {
      id: "11111111-2222-3333-4444-555555555555", entry_date: "2026-10-01",
      tach: 4172.9, hobbs: 984.9, airframe: 6130.2,
      work_performed: "Changed oil and filter; inspected for leaks.",
      signature_name: "A. Mechanic", mechanic_cert_number: "123456",
      authored_cert_kind: "mechanic", authored_cert_rating: "A&P",
      authored_signed_at: "2026-10-01T12:34:56Z", authored_digest: "abcdef1234567890",
      authored_payload: { performed_by: "A. Mechanic" }, supersedes_entry_id: null,
    }, tailNumber: "N123AB", logbookName: "Engine", widthIn: 4,
  }));
  for (const text of ["N123AB · Engine", "2026-10-01", "Tach 4172.9", "Hobbs 984.9", "Airframe 6130.2",
    "Changed oil and filter", "A. Mechanic", "123456", "MTL ENTRY ID: 11111111-2222-3333-4444-555555555555", "MTL DIGEST: abcdef1234567890"])
    assert.ok(html.includes(text), text);
  assert.ok(html.includes("width:4in"));
});
