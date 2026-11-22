import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteAccount, parseDeletionRequest } from "../src/lib/accountDeletion";

test("deletion needs an explicit confirm field", () => {
  for (const body of [null, undefined, "DELETE", {}, { confirm: "" }, { confirm: "yes" }, { confirm: true }, { confirmTail: "N734DM" }]) {
    const r = parseDeletionRequest(body);
    assert.equal("error" in r && r.status, 400, JSON.stringify(body));
  }
  for (const confirm of ["DELETE", "delete", " Delete "]) assert.deepEqual(parseDeletionRequest({ confirm }), { ok: true });
});

// Minimal Supabase stand-in: every query is a thenable chain that records its
// table and verb and resolves from `answers[table]`.
function fakeSvc(answers: Record<string, { data?: unknown; count?: number; error?: { message: string } }>) {
  const log: string[] = [];
  const query = (table: string, verb: string) => {
    log.push(`${verb} ${table}`);
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "not", "order", "range", "delete"]) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, count: 0, error: null, ...(verb === "select" ? answers[table] : {}) });
    return chain;
  };
  const svc = {
    from: (table: string) => ({ select: () => query(table, "select"), delete: () => query(table, "delete") }),
    auth: { admin: { deleteUser: async (id: string) => (log.push(`deleteUser ${id}`), { error: null }) } },
  };
  return { svc: svc as never, log };
}

test("deletes owned aircraft, then their files, then the user", async () => {
  const { svc, log } = fakeSvc({
    aircraft: { data: [{ id: "ac1" }] },
    page: { data: [{ aircraft_id: "ac1", storage_path: "ac1/p.jpg", thumbnail_path: null }, { aircraft_id: "ac1", storage_path: "foreign/private.jpg" }] },
    document: { data: [{ aircraft_id: "ac1", storage_path: "ac1/d.pdf" }] },
  });
  const removed: string[] = [];
  const result = await deleteAccount(svc, "u1", async (p) => {
    log.push("removeBlobs");
    removed.push(...p);
  });
  assert.deepEqual(result, { ok: true, deletedAircraft: 1 });
  assert.deepEqual(removed, ["ac1/p.jpg", "ac1/d.pdf"]);
  const at = (s: string) => log.indexOf(s);
  assert.ok(at("delete aircraft") > 0 && at("delete aircraft") < at("removeBlobs") && at("removeBlobs") < at("deleteUser u1"));
});

test("refuses before removing anything when signed entries would block the cascade", async () => {
  const { svc, log } = fakeSvc({ aircraft: { data: [{ id: "ac1" }] }, log_entry: { count: 2 } });
  const result = await deleteAccount(svc, "u1", async () => assert.fail("no files removed"));
  assert.equal("error" in result && result.status, 409);
  assert.ok(!log.some((l) => l.startsWith("delete") || l.startsWith("deleteUser")));
});
