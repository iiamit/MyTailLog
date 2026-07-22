import { test } from "node:test";
import assert from "node:assert/strict";
import { searchADs, getADByNumber } from "../src/lib/faa/federalRegister";

let lastUrl = "";
function withFetch<T>(body: unknown, status: number, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string) => {
    lastUrl = String(input);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = orig;
  });
}

const RESULTS = {
  count: 2,
  results: [
    {
      title: "Airworthiness Directives; Textron Aviation",
      document_number: "2024-13481",
      effective_on: "2024-08-01",
      html_url: "https://www.federalregister.gov/d/2024-13481",
      pdf_url: "https://www.govinfo.gov/content/pkg/x.pdf",
      raw_text_url: "https://www.federalregister.gov/d/2024-13481.txt",
      citation: "89 FR 12345",
      abstract: "We are adopting a new AD for Cessna 172.",
      regulation_id_numbers: ["2120-AA64"],
      docket_ids: ["FAA-2024-1234", "AD 2024-13-06"],
    },
    {
      title: "Airworthiness Directives; Lycoming",
      document_number: "2024-99999",
      docket_ids: [], // no AD number
    },
  ],
};

test("searchADs: maps FR documents into FaaAd records", async () => {
  const { count, ads } = await withFetch(RESULTS, 200, () => searchADs("Cessna"));
  assert.equal(count, 2);
  assert.equal(ads.length, 2);
  const a = ads[0];
  assert.equal(a.adNumber, "2024-13-06"); // parsed from docket_ids
  assert.equal(a.documentNumber, "2024-13481");
  assert.equal(a.effectiveOn, "2024-08-01");
  assert.equal(a.rin, "2120-AA64"); // first regulation_id_number
  assert.equal(a.fullTextUrl, "https://www.federalregister.gov/d/2024-13481.txt");
  assert.equal(ads[1].adNumber, null); // empty docket_ids
});

test("searchADs: builds the FAA / RULE / 14 CFR 39 query", async () => {
  await withFetch(RESULTS, 200, () => searchADs("Garmin"));
  assert.match(lastUrl, /agencies%5D%5B%5D=federal-aviation-administration/);
  assert.match(lastUrl, /type%5D%5B%5D=RULE/);
  assert.match(lastUrl, /conditions%5Bterm%5D=Garmin/);
});

test("searchADs: a non-OK response throws", async () => {
  await assert.rejects(
    () => withFetch("upstream boom", 503, () => searchADs("Cessna")),
    /Federal Register API returned 503/,
  );
});

test("getADByNumber: returns the result whose parsed AD number matches (revision-insensitive)", async () => {
  const ad = await withFetch(RESULTS, 200, () => getADByNumber("AD 2024-13-06"));
  assert.ok(ad);
  assert.equal(ad!.adNumber, "2024-13-06");
});

test("getADByNumber: no matching AD number → null", async () => {
  const ad = await withFetch(RESULTS, 200, () => getADByNumber("1999-01-01"));
  assert.equal(ad, null);
});

test("getADByNumber: an empty reference short-circuits to null", async () => {
  assert.equal(await getADByNumber("AD"), null); // cleanAdNumber('AD') === ''
});
