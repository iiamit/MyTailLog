import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adModelPath,
  buildCatalogRow,
  detectMakes,
  displayModel,
  displayTitle,
  makeBySlug,
  modelSlug,
  normalizeModel,
  preferAd,
  seriesKeys,
} from "../src/lib/faa/adCatalog";
import type { FaaAd } from "../src/lib/faa/federalRegister";

const ad = (over: Partial<FaaAd>): FaaAd => ({
  adNumber: "2023-02-17",
  documentNumber: "2023-01234",
  title: "Airworthiness Directives; Cessna Aircraft Company Airplanes",
  abstract: "The FAA is adopting a new AD for certain Cessna Aircraft Company Model 172N, 172P, and F172N airplanes.",
  effectiveOn: "2023-03-01",
  htmlUrl: "https://www.federalregister.gov/documents/2023/01/25/2023-01234/x",
  pdfUrl: "https://www.govinfo.gov/content/pkg/FR-2023-01-25/pdf/2023-01234.pdf",
  fullTextUrl: null,
  citation: "88 FR 4567",
  rin: null,
  ...over,
});

test("slugs: model lowercased, non-alphanumerics stripped; makes from the fixed map", () => {
  assert.equal(modelSlug("172N"), "172n");
  assert.equal(modelSlug("O-320-D2J"), "o320d2j");
  assert.equal(modelSlug("TAE 125-02-99"), "tae1250299");
  assert.equal(normalizeModel("o-320"), "O320");
  assert.equal(adModelPath("cessna", "172N"), "/ads/cessna/172n");
  assert.equal(makeBySlug("Cessna")?.name, "Cessna");
  assert.equal(makeBySlug("boeing"), undefined);
});

test("seriesKeys: a model plus the base series it extends with a letter", () => {
  assert.deepEqual(seriesKeys("172N"), ["172N", "172"]);
  assert.deepEqual(seriesKeys("O-320-D2J"), ["O320D2J", "O320", "O320D2"]);
  assert.deepEqual(seriesKeys("T182T"), ["T182T", "T182"]);
  assert.deepEqual(seriesKeys("182"), ["182"]);
});

test("detectMakes reads the title, not the abstract", () => {
  assert.deepEqual(detectMakes("Airworthiness Directives; Piper Aircraft, Inc. Airplanes"), ["piper"]);
  assert.deepEqual(detectMakes("Airworthiness Directives; Textron Lycoming Fuel Injected Reciprocating Engines"), ["lycoming"]);
  assert.deepEqual(
    detectMakes("Airworthiness Directives; Avidyne Corporation Primary Flight Displays", "installed on Cessna and Piper airplanes"),
    [],
  );
  assert.deepEqual(
    detectMakes("Airworthiness Directives; Textron Aviation Inc. (Type Certificate Previously Held by Cessna Aircraft Company) Airplanes"),
    ["cessna"],
  );
});

test("detectMakes resolves a bare Textron Aviation title", () => {
  const t = "Airworthiness Directives; Textron Aviation Inc. Airplanes";
  assert.deepEqual(detectMakes(t, "certain Textron Model B300 and B300C airplanes", ["B300", "B300C"]), ["beechcraft"]);
  assert.deepEqual(detectMakes(t, "certain Textron Model 172R airplanes", ["172R", "T206H"]), ["cessna"]);
  assert.deepEqual(detectMakes(t, "certain Textron airplanes", ["B300", "172R"]), ["textron"]);
});

test("buildCatalogRow: FR document → catalog row with makes and normalized models", () => {
  assert.deepEqual(buildCatalogRow(ad({})), {
    ad_number: "2023-02-17",
    title: "Airworthiness Directives; Cessna Aircraft Company Airplanes",
    abstract: "The FAA is adopting a new AD for certain Cessna Aircraft Company Model 172N, 172P, and F172N airplanes.",
    effective_date: "2023-03-01",
    makes: ["cessna"],
    models: ["172N", "172P", "F172N"],
    fr_html_url: "https://www.federalregister.gov/documents/2023/01/25/2023-01234/x",
    pdf_url: "https://www.govinfo.gov/content/pkg/FR-2023-01-25/pdf/2023-01234.pdf",
    citation: "88 FR 4567",
    source: "federal_register",
  });
  const engine = buildCatalogRow(
    ad({ title: "Airworthiness Directives; Lycoming Engines Reciprocating Engines", abstract: "This AD applies to Lycoming Model O-320-D2J and IO-360-A1A reciprocating engines." }),
  );
  assert.deepEqual(engine?.makes, ["lycoming"]);
  assert.deepEqual(engine?.models, ["O320D2J", "IO360A1A"]);
});

test("Cessna catalog keys describe the airframes, not the fitted components", () => {
  const cases = [
    {
      // https://www.govinfo.gov/content/pkg/FR-1998-12-02/pdf/98-32045.pdf
      rule: ad({
        adNumber: "98-24-14",
        documentNumber: "98-32045",
        title: "Airworthiness Directives; Cessna Aircraft Company Models 340A and 414A Airplanes",
        abstract: "This AD concerns certain Cessna Models 340A and 414A airplanes equipped with an exhaust WYE tube, part number (P/N) 9910299-25 or P/N 9910299-26, in the engine exhaust system. This AD requires removing from service any P/N 9910299-25 or P/N 9910299-26 engine exhaust system WYE tube.",
      }),
      keys: ["340A", "414A"],
    },
    {
      // https://www.govinfo.gov/content/pkg/FR-1998-11-04/html/98-29363.htm
      rule: ad({
        adNumber: "98-23-02",
        documentNumber: "98-29363",
        title: "Airworthiness Directives; Cessna Aircraft Company 180 and 185 Series Airplanes",
        abstract: "Certain Cessna 180 and 185 series airplanes have Airglas Model LW3600-180 (single position) or Model LW3600-180A (two position) wheel skis installed. This AD adds Cessna Model 180K airplanes to the applicability section.",
      }),
      keys: ["180", "185", "180K"],
    },
  ];

  for (const { rule, keys } of cases) {
    const catalog = buildCatalogRow(rule);
    assert.ok(catalog);
    // Both rows must still be upsertable by their existing AD numbers.
    assert.equal(catalog.ad_number, rule.adNumber);
    assert.deepEqual(catalog.makes, ["cessna"]);
    assert.deepEqual(catalog.models, keys);
    assert.equal(catalog.abstract, rule.abstract); // still show the equipment conditions
  }
});

test("catalog still lists standalone propeller models", () => {
  const row = buildCatalogRow(ad({
    title: "Airworthiness Directives; Hartzell Propeller Inc. Propellers",
    abstract: "This AD concerns Hartzell Model HC-C2YK propellers.",
  }));
  assert.deepEqual(row?.makes, ["hartzell"]);
  assert.deepEqual(row?.models, ["HCC2YK"]);
});

test("buildCatalogRow skips ADs it can't list", () => {
  assert.equal(buildCatalogRow(ad({ adNumber: null })), null);
  assert.equal(buildCatalogRow(ad({ title: "Airworthiness Directives; Various Airplanes", abstract: "Model 172N airplanes" })), null);
  assert.equal(buildCatalogRow(ad({ abstract: "The FAA is adopting a new AD for certain airplanes." })), null);
  assert.equal(buildCatalogRow(ad({
    title: "Airworthiness Directives; Cessna Aircraft Company and Beechcraft Corporation Airplanes",
    abstract: "This AD applies to Cessna Model 172N and Beechcraft Model B300 airplanes.",
  })), null); // separate make/model arrays would create Cessna B300 and Beechcraft 172N
});

test("preferAd keeps the original rule over a correction notice", () => {
  const original = ad({ documentNumber: "a" });
  const correction = ad({ documentNumber: "b", abstract: "The FAA is correcting an airworthiness directive (AD)..." });
  assert.equal(preferAd(undefined, correction).documentNumber, "b");
  assert.equal(preferAd(correction, original).documentNumber, "a");
  assert.equal(preferAd(original, correction).documentNumber, "a");
});

test("display helpers", () => {
  assert.equal(displayTitle("Airworthiness Directives; Cessna Aircraft Company Airplanes"), "Cessna Aircraft Company Airplanes");
  assert.equal(displayModel("O320D2J", "Lycoming Model O-320-D2J engines"), "O-320-D2J");
  assert.equal(displayModel("172N", "nothing here"), "172N");
});

test("catalog ingest requires the cron key and rejects ambiguous make/model rows", async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "catalog-test-key";
  try {
    const { POST } = await import("../src/app/api/cron/ad-catalog/route");
    const url = "http://localhost/api/cron/ad-catalog";
    const body = JSON.stringify({ rows: [{ ...buildCatalogRow(ad({}))!, makes: ["cessna", "beechcraft"] }] });
    assert.equal((await POST(new Request(url, { method: "POST", body }))).status, 401);
    assert.equal((await POST(new Request(url, {
      method: "POST", body,
      headers: { authorization: "Bearer catalog-test-key", "content-type": "application/json" },
    }))).status, 400);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});
