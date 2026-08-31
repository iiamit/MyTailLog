import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Page numbering on the capture route — the path the iOS app drains into.
//
// Reported from the field: "Airframe has no numbers to it, the engine is
// numbered entirely, and the prop has some numbers and some do not." The web
// uploader ran its own counter and always sent a sequence; the phone never did,
// and an unsupplied sequence was stored as NULL. A logbook filled from both
// clients ended up numbered in patches.
//
// The number now comes from the server when the client doesn't supply one, so a
// page cannot arrive unnumbered whatever captured it.

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

// A 1x1 JPEG — the route stores the blob, and the sequence is what's under test.
const PIXEL =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

async function capture(
  request: import("@playwright/test").APIRequestContext,
  aircraftId: string,
  logbookId: string,
  body: Record<string, unknown>,
) {
  const res = await request.post(`/api/aircraft/${aircraftId}/capture`, {
    data: {
      pageId: randomUUID(),
      logbookId,
      image: PIXEL,
      capturedAt: new Date().toISOString(),
      isHandwritten: true,
      ...body,
    },
  });
  expect(res.status(), `capture: ${await res.text()}`).toBe(200);
  return (await res.json()).pageId as string;
}

test("capture: a page with no sequence supplied is still numbered", async ({ request, scratch }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const { data: logbooks } = await admin
    .from("logbook")
    .select("id, type")
    .eq("aircraft_id", scratch.id);
  const airframe = logbooks!.find((l) => l.type === "airframe")!.id;

  const seqOf = async (pageId: string) => {
    const { data } = await admin.from("page").select("page_sequence").eq("id", pageId).single();
    return data!.page_sequence;
  };

  // What the phone sends: no sequence at all. This is the reported bug — it used
  // to land as NULL and render as "—" forever.
  const first = await capture(request, scratch.id, airframe, {});
  expect(await seqOf(first), "an unnumbered capture must not stay unnumbered").not.toBeNull();

  // And the next one continues rather than repeating.
  const second = await capture(request, scratch.id, airframe, {});
  expect(await seqOf(second)).toBe((await seqOf(first))! + 1);

  // A client that DOES send one still wins — the web uploader counts across a
  // whole batch and must keep its own order.
  const explicit = await capture(request, scratch.id, airframe, { pageSequence: 99 });
  expect(await seqOf(explicit)).toBe(99);

  // …and the server picks up after it.
  const after = await capture(request, scratch.id, airframe, {});
  expect(await seqOf(after)).toBe(100);
});
