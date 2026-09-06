import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { sendEmail } from "../src/lib/email.ts";

// Execute the real server action with only its Next/Supabase boundaries mocked.
// Keep the real email transport, intercepting fetch so no messages leave tests.
const source = readFileSync(new URL("../src/app/aircraft/[id]/share/actions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function actions({ signedIn = true, owner = true, dbError = null } = {}) {
  const grants = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: "owner", email: "owner@example.com" } : null } }) },
    from: (table) => table === "aircraft" ? {
      select: () => ({ eq: () => ({ single: async () => ({ data: { owner_id: owner ? "owner" : "someone-else", tail_number: 'N123<&"' } }) }) }),
    } : {
      upsert: async (row) => {
        if (!dbError) grants.push(row);
        return { error: dbError };
      },
    },
  };
  const exports = {};
  const dependencies = {
    "next/cache": { revalidatePath() {} },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/storage": {},
    "@/lib/email": { sendEmail },
  };
  runInNewContext(compiled, { exports, process, require: (id) => {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
    return dependencies[id];
  } });
  return { addShare: exports.addShare, grants };
}

test("share invitations send for both roles, retain access on mail failure, and reject unauthorized writes", async (t) => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.RESEND_API_KEY = "test-only";
  process.env.NEXT_PUBLIC_SITE_URL = "https://mytaillog.example/";
  t.after(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalOrigin === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalOrigin;
  });
  const requests = [];
  let status = 200;
  let networkError = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    requests.push(JSON.parse(options.body));
    if (networkError) throw new Error("offline");
    return new Response("{}", { status });
  });
  t.mock.method(console, "error", () => {});

  for (const role of ["viewer", "editor"]) {
    const { addShare, grants } = actions();
    const result = await addShare("aircraft-id", "  Guest@Example.com  ", role);
    assert.equal(result.emailSent, true);
    assert.equal(grants[0].role, role);
    assert.equal(grants[0].invited_email, "guest@example.com");
    assert.equal(grants[0].invited_by, "owner");
    const email = requests.at(-1);
    assert.equal(email.to, "guest@example.com");
    assert.match(email.html, /https:\/\/mytaillog.example\/aircraft\/aircraft-id/);
    assert.match(email.html, /N123&lt;&amp;&quot;/);
    assert.match(email.html, /Sign in or create an account/);
    assert.match(email.html, role === "viewer" ? /View only/ : /Can contribute/);
  }

  for (const failure of ["rejected", "network", "unconfigured"]) {
    status = 503;
    networkError = failure === "network";
    if (failure === "unconfigured") delete process.env.RESEND_API_KEY;
    const { addShare, grants } = actions();
    const result = await addShare("aircraft-id", "guest@example.com", "viewer");
    assert.equal(result.error, undefined);
    assert.equal(result.emailSent, false, failure);
    assert.equal(grants.length, 1, "a delivery failure must not undo access");
  }

  process.env.RESEND_API_KEY = "test-only";
  const sentBefore = requests.length;
  for (const options of [{ signedIn: false }, { owner: false }, { dbError: { message: "write failed" } }]) {
    const { addShare, grants } = actions(options);
    assert.ok((await addShare("aircraft-id", "guest@example.com", "editor")).error);
    assert.equal(grants.length, 0);
  }
  for (const [email, role] of [["invalid", "viewer"], ["guest@example.com", "owner"], ["a@b.com\nBcc:x@y.com", "viewer"]]) {
    const { addShare, grants } = actions();
    assert.ok((await addShare("aircraft-id", email, role)).error);
    assert.equal(grants.length, 0);
  }
  assert.equal(requests.length, sentBefore, "failed/unauthorized grants must never send email");
});
