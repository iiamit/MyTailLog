import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// "Merge with previous page" — consolidating an entry that runs across pages.
//
// Reported from the field, on a 3-page handwritten annual: "If there is
// equipment on page 16, or ADs/SBs but you merge, and that entry is no longer
// there, then the system wouldn't capture it in the equipment section, would
// it?" He was right. Five tables reference log_entry ON DELETE SET NULL, so
// deleting the merged-away entry silently severed every link to it — the text
// survived the merge, its provenance did not.

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("merge: an entry's text AND everything linked to it move to the head", async ({
  page,
  scratch,
}) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const { data: logbooks } = await admin
    .from("logbook")
    .select("id, type")
    .eq("aircraft_id", scratch.id);
  const airframe = logbooks!.find((l) => l.type === "airframe")!.id;

  // Two pages of one annual: the head runs off the bottom of page 1, the tail
  // carries the rest and the mechanic's signature.
  const mkPage = async (seq: number) => {
    const id = randomUUID();
    const { error } = await admin.from("page").insert({
      id,
      aircraft_id: scratch.id,
      logbook_id: airframe,
      storage_path: `${scratch.id}/merge-${seq}.jpg`,
      page_sequence: seq,
      review_status: "unreviewed",
      extraction_status: "extracted",
    });
    expect(error, `seed page ${seq}: ${error?.message}`).toBeFalsy();
    return id;
  };
  const headPage = await mkPage(1);
  const tailPage = await mkPage(2);

  const mkEntry = async (pageId: string, fields: Record<string, unknown>) => {
    const { data, error } = await admin
      .from("log_entry")
      .insert({
        aircraft_id: scratch.id,
        logbook_id: airframe,
        page_id: pageId,
        entry_date: "2009-08-14",
        ...fields,
      })
      .select("id")
      .single();
    expect(error, `seed entry: ${error?.message}`).toBeFalsy();
    return data!.id as string;
  };

  const headText = `Annual inspection begun ${randomUUID().slice(0, 8)}`;
  const tailText = `installed new brake linings ${randomUUID().slice(0, 8)}`;
  const headId = await mkEntry(headPage, {
    description: headText,
    continues_next: true,
    ad_refs: ["AD 87-20-03"],
  });
  const tailId = await mkEntry(tailPage, {
    description: tailText,
    is_continuation: true,
    signature_name: "A. Mechanic",
    mechanic_cert_number: "A&P 1234567",
    ad_refs: ["AD 93-05-06"],
  });

  // Equipment whose install is documented by the TAIL entry — the case in the
  // report. Without the relink this is orphaned the moment the tail is deleted.
  const { data: comp, error: cErr } = await admin
    .from("component")
    .insert({
      aircraft_id: scratch.id,
      name: `Brake linings ${randomUUID().slice(0, 6)}`,
      install_entry_id: tailId,
      install_date: "2009-08-14",
    })
    .select("id")
    .single();
  expect(cErr, `seed component: ${cErr?.message}`).toBeFalsy();

  // Merge the tail into the head, from the tail page's review screen.
  await page.goto(`${scratch.path}/pages/${tailPage}/review`);
  // The flagged-continuation banner offers "Merge into that entry"; an entry not
  // flagged offers "Merge ↑ prev page". This one is flagged.
  await page.getByRole("button", { name: /merge into that entry/i }).click();
  await expect(page.getByText(/0 entries/i)).toBeVisible({ timeout: 20_000 });

  // --- the text ends up on the head, which is what the owner is looking for ---
  const { data: merged } = await admin
    .from("log_entry")
    .select("description, signature_name, mechanic_cert_number, ad_refs")
    .eq("id", headId)
    .single();
  expect(merged!.description, "both halves of the description").toContain(headText);
  expect(merged!.description).toContain(tailText);
  expect(merged!.signature_name, "the closing signature comes from the tail").toBe("A. Mechanic");
  expect(merged!.mechanic_cert_number).toBe("A&P 1234567");
  expect([...(merged!.ad_refs ?? [])].sort()).toEqual(["AD 87-20-03", "AD 93-05-06"]);

  // --- and the tail is gone -------------------------------------------------
  const { data: goneRow } = await admin.from("log_entry").select("id").eq("id", tailId).maybeSingle();
  expect(goneRow, "the tail entry is consumed by the merge").toBeNull();

  // --- THE REPORTED BUG: the equipment link must follow the entry -----------
  const { data: after } = await admin
    .from("component")
    .select("install_entry_id")
    .eq("id", comp!.id)
    .single();
  expect(
    after!.install_entry_id,
    "equipment installed by the merged entry must point at the surviving entry, not nothing",
  ).toBe(headId);
});
