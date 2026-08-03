import { test } from "node:test";
import assert from "node:assert/strict";
import { lookupRegistration } from "../src/lib/faa/registry";

// Stub global fetch with a canned Response; restore after each test.
function withFetch<T>(res: () => Response | Promise<Response>, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => res()) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = orig;
  });
}

const REGISTRY_HTML = `
  <table>
    <td data-label="Manufacturer Name" class="c">CESSNA</td>
    <td data-label="Model">172N</td>
    <td data-label="Serial Number">17271234</td>
    <td data-label="Mfr Year">1977</td>
    <td data-label="Engine Manufacturer">LYCOMING</td>
    <td data-label="Engine Model">O-320-H2AD</td>
    <td data-label="Name">DOE JOHN &amp; JANE</td>
    <td data-label="Status">Valid</td>
  </table>`;

test("lookupRegistration: parses a registration record and prefixes the tail with N", async () => {
  const rec = await withFetch(() => new Response(REGISTRY_HTML, { status: 200 }), () =>
    lookupRegistration("N172NX"),
  );
  assert.ok(rec);
  assert.equal(rec!.tailNumber, "N172NX");
  assert.equal(rec!.make, "CESSNA");
  assert.equal(rec!.model, "172N");
  assert.equal(rec!.serialNumber, "17271234");
  assert.equal(rec!.year, 1977);
  assert.equal(rec!.engineMake, "LYCOMING");
  assert.equal(rec!.engineModel, "O-320-H2AD");
  assert.equal(rec!.status, "Valid");
});

test("lookupRegistration: decodes HTML entities in field values", async () => {
  const rec = await withFetch(() => new Response(REGISTRY_HTML, { status: 200 }), () =>
    lookupRegistration("N172NX"),
  );
  assert.equal(rec!.registrantName, "DOE JOHN & JANE");
});

test("lookupRegistration: a non-4-digit year is dropped to null", async () => {
  const html = REGISTRY_HTML.replace("1977", "77");
  const rec = await withFetch(() => new Response(html, { status: 200 }), () => lookupRegistration("N1X"));
  assert.equal(rec!.year, null);
});

test("lookupRegistration: no manufacturer/serial cells → not found (null)", async () => {
  const rec = await withFetch(() => new Response("<table><td>nothing</td></table>", { status: 200 }), () =>
    lookupRegistration("N999"),
  );
  assert.equal(rec, null);
});

test("lookupRegistration: a non-OK upstream returns null", async () => {
  const rec = await withFetch(() => new Response("", { status: 404 }), () => lookupRegistration("N999"));
  assert.equal(rec, null);
});

test("lookupRegistration: an oversized response (content-length cap) returns null", async () => {
  const rec = await withFetch(
    () => new Response(REGISTRY_HTML, { status: 200, headers: { "content-length": "3000000" } }),
    () => lookupRegistration("N172NX"),
  );
  assert.equal(rec, null);
});

test("lookupRegistration: an empty/invalid tail short-circuits to null without fetching", async () => {
  // No fetch stub — if it tried to fetch, the real network call would be made;
  // instead normalizeTail('N') === '' returns null first.
  assert.equal(await lookupRegistration("N"), null);
  assert.equal(await lookupRegistration("   "), null);
});

// CodeQL js/double-escaping. Chained .replace() decoded `&amp;` first, so the
// literal text `&amp;lt;` became `&lt;` and was decoded a second time into `<` —
// a character the FAA page never contained. One pass can't re-read its own
// output, so an escaped entity survives as text.
test("lookupRegistration: an escaped entity is decoded exactly once", async () => {
  const html = `
    <table>
      <td data-label="Manufacturer Name">CESSNA</td>
      <td data-label="Serial Number">17271234</td>
      <td data-label="Name">A &amp;lt;B&amp;gt; &amp; C</td>
    </table>`;
  const rec = await withFetch(
    () => new Response(html, { status: 200 }),
    () => lookupRegistration("N172NX"),
  );
  // The raw cell holds `&amp;lt;`. Decoding once gives the literal text `&lt;`.
  // The old chain decoded `&amp;` first (→ `&lt;`) and then decoded THAT (→ `<`),
  // manufacturing a tag delimiter the page never contained. This input is chosen
  // to separate the two: anything that isn't `&amp;`-prefixed passes either way.
  assert.equal(rec?.registrantName, "A &lt;B&gt; & C");
  assert.ok(!rec?.registrantName?.includes("<"), "must not manufacture a tag that wasn't there");
});
