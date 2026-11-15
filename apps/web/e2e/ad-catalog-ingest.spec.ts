import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

test("AD catalog cron route writes to the test database with its existing secret", async ({ request }) => {
  const url = process.env.TEST_SUPABASE_URL!;
  const key = process.env.TEST_SUPABASE_SECRET_KEY!;
  const admin = createClient(url, key);
  const adNumber = "2099-01-01";
  const row = {
    ad_number: adNumber,
    title: "Airworthiness Directives; Test Cessna Model 172N",
    abstract: null,
    effective_date: "2099-01-01",
    makes: ["cessna"],
    models: ["172N"],
    fr_html_url: null,
    pdf_url: null,
    citation: null,
    source: "federal_register",
  };
  try {
    expect((await request.post("/api/cron/ad-catalog", { data: { rows: [row] } })).status()).toBe(401);
    const response = await request.post("/api/cron/ad-catalog", {
      headers: { authorization: "Bearer e2e-cron-secret" },
      data: { rows: [row] },
    });
    expect(response.status(), await response.text()).toBe(200);
    const { data, error } = await admin.from("ad_catalog").select("makes, models").eq("ad_number", adNumber).single();
    expect(error).toBeNull();
    expect(data).toEqual({ makes: ["cessna"], models: ["172N"] });
  } finally {
    await admin.from("ad_catalog").delete().eq("ad_number", adNumber);
  }
});
