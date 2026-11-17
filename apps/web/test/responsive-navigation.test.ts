import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AircraftShell } from "../src/components/shell/AircraftShell";
import { AccountShell } from "../src/components/shell/AccountShell";
import type { AircraftShellContext } from "../src/lib/aircraftContext";

const context: AircraftShellContext = {
  id: "test-aircraft", reg: "N734DM", type: "Cessna 172N", serial: null,
  demo: false, isOwner: true, canEdit: true, tach: null, hobbs: null,
  airframe: null, currentHours: null, bridge: null, annun: null,
  badges: { status: 2, review: 3, equipment: 1 },
};
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
function render(path: string, aircraft?: AircraftShellContext) {
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
    createElement(PathnameContext.Provider, { value: path }, aircraft
      ? createElement(AircraftShell, { context: aircraft, children: "Content" })
      : createElement(AccountShell, { children: "Content" }))));
}

test("compact aircraft navigation keeps four shortcuts, review priority and all remaining destinations", () => {
  const html = render("/aircraft/test-aircraft/compliance/explore", context);
  const shortcuts = html.match(/<nav aria-label="Aircraft shortcuts"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  assert.equal((shortcuts.match(/<a /g) ?? []).length, 4);
  assert.match(shortcuts, /aria-current="page"[^>]*>Status/);
  for (const href of ["/status", "/timeline", "/capture"]) assert.ok(shortcuts.includes(`href="/aircraft/test-aircraft${href}"`));
  const menu = html.match(/<details[\s\S]*?<\/details>/)?.[0] ?? "";
  for (const label of ["Log", "Records", "Workflows", "Manage", "Review", "Profile", "Help &amp; docs"]) assert.ok(menu.includes(label), label);
  assert.match(menu, /3 pages to review/);
  assert.ok(menu.includes('href="/aircraft/test-aircraft/share"'));
});

test("view-only aircraft keep three shortcuts and omit editing and owner-only destinations", () => {
  const html = render("/aircraft/test-aircraft", { ...context, canEdit: false, isOwner: false, badges: { status: 0, review: 0, equipment: 0 } });
  const shortcuts = html.match(/<nav aria-label="Aircraft shortcuts"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  assert.equal((shortcuts.match(/<a /g) ?? []).length, 3);
  assert.doesNotMatch(html, /href="\/aircraft\/test-aircraft\/(capture|review|import|share)"/);
});

test("compact account menu preserves grouped routes and the current page", () => {
  const html = render("/profile");
  const menu = html.match(/<details[\s\S]*?<\/details>/)?.[0] ?? "";
  assert.match(menu, /Fleet/);
  assert.match(menu, /Account/);
  assert.match(menu, /<a[^>]*aria-current="page"[^>]*href="\/profile"/);
  for (const href of ["/dashboard", "/aircraft/enroll", "/developers", "/help", "/whats-new"]) assert.ok(menu.includes(`href="${href}"`));
});
