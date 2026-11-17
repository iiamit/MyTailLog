# Local Mac handoff — 17 November 2026

Branch: `codex/local-mac-handoff`, based on `codex/mfb-test-backend`.
This snapshot includes all outstanding workspace changes: interface refinement
and hardening, status/countdown fixes, MyFlightBook/backend documentation and
tests, critique history, and the marketing package. It is a continuation
checkpoint, not a release or a deployment request.

## Setup

Use Node **22 or newer** (Capacitor 8 requires it), npm and Xcode with an iOS
simulator installed. Install Xcode command-line tools if not already available.

```bash
git clone --branch codex/local-mac-handoff https://github.com/iiamit/MyTailLog.git
cd MyTailLog
npm ci --prefix apps/web
npm ci --prefix apps/mobile
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Fill in those environment files securely before running the apps. They are
ignored and are not part of this Git snapshot. See the examples and
`docs/mfb-test-backend.md` for configuration. Use the intended test backend for
testing writes. Mobile's `VITE_API_BASE` defaults to production; explicitly set
it to the matching test API. Its Supabase URL/key must match that backend.
An iOS simulator can reach a Mac-hosted web API at `http://localhost:3000`.

## Run and verify

From the repository root:

```bash
npm run typecheck
npm test
npm run mobile:check
npm run dev
```

The web app runs at `http://localhost:3000`. In another terminal:

```bash
cd apps/web
npx playwright install chromium
```

For the full E2E suite, configure the dedicated test Supabase project and
export `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`,
`TEST_SUPABASE_SECRET_KEY`, `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` in the
shell, then run `npm run e2e` from `apps/web`. See
`docs/e2e-regression-plan.md` and `apps/web/playwright.config.ts`. The Playwright
configuration reads these from the process environment; creating `.env.local`
alone does not export them to Playwright.

Generate the ignored native iOS project on the Mac, then open Xcode:

```bash
cd apps/mobile
npm run build
npx cap add ios
npm run ios
```

Run `npx cap add ios` only once. Later, use `npm run ios` again. Choose an
iPhone or iPad simulator in Xcode and run. Real-device signing and scanning
need the appropriate Apple setup/device. Android setup, including the ignored
Firebase configuration file, is documented in `apps/mobile/README.md`.

## Current implementation and verification

The three most recently requested fixes are implemented:

- Shared maintenance/AD, entry/record and Account sheets use native modal focus
  management, explicit exits and guarded Escape. Modal key/touch events stop
  before document-level shortcut and swipe-back listeners.
- AD save/delete preserves input, distinguishes failed queue writes from
  already-queued changes, and retries the captured refresh without enqueueing
  a second action. Its parent preserves the editor on refresh failure.
- EntryEditor checks every form field and selected logbook before dismissal.
  Unchanged/reverted drafts close normally; changed drafts require explicit
  discard. Saving prevents dismissal.

Last checks: **771 tests passed**, both apps passed type checking, mobile Vite
build passed, and scoped modal/editor lint passed. Broader lint still reports
existing React hook issues in `record-screen.tsx` and `status-screen.tsx`.
The build retains its existing large-chunk warning.

This Linux host could not launch Chromium (`libglib-2.0.so.0` missing), and
dependency installation failed unavailable `su` authentication. No current
browser screenshots, rendered contrast/layout measurements, emulator testing,
or native assistive-technology verification was completed.

On the Mac, verify:

1. Homepage, dashboard and aircraft workspace at desktop/phone widths; light
   and dark themes and large text. Check sign-up emphasis, the unfilled store
   badges under the hero sign-up button and responsive navigation.
2. Shared sheets: initial/contained/restored focus, visible exits, Escape,
   backdrop taps, keyboard shortcuts, edge swipes and Android Back where
   available. Include long titles, keyboard clearance and safe areas.
3. Changed entry drafts: cancel/discard, category moves, reverted edits and
   saving. Ensure shell navigation cannot bypass the discard decision.
4. AD save/delete with queue, local-mirror, refresh and sync failures. A queued
   change must never be enqueued again by its recovery action.
5. Due dates and hour limits together, direct mobile AD details, viewer
   permissions, empty/unavailable states and offline recovery.

## Fresh critique and remaining work

Latest full report:
`.impeccable/critique/2026-11-17T17-08-56Z__apps-web-src-app-aircraft-id-page-tsx.md`.
Independent source-only scores were **23 → 29 → 28 → 26 /40**. The latest
decrease reflects newly found gaps beyond the three completed fixes, especially
unsent-work deletion and keyboard recording. Scores are heuristic judgments;
do not treat this as a measured visual regression or assume fixes earn points.

Remaining priorities (not implemented in this checkpoint):

1. **P1:** Warn before sign-out wipes pending queues/uploads. Offer sync,
   cancel or explicit discard; preserve account isolation.
2. **P1:** Extend queue-aware failure/retry handling to maintenance and
   reading/oil writes, including partial completion.
3. **P1:** Make reading correction and meter steppers keyboard accessible;
   provide a visible, protected deletion route.
4. **P2:** Extend draft/busy-exit protection to other editors, including
   ReadingEditor's Cancel while saving.
5. **P2:** Carry the selected item ID from web Status/overview into the
   destination's details instead of requiring users to find it again.

Suggested new Codex session prompt:

> Read docs/local-mac-handoff.md and the latest saved critique. Validate this
> branch in the local browser and iPhone/iPad simulator, focusing first on the
> three implemented hardening fixes. Report actual runtime failures before
> changing scope. Do not deploy or publish a release.


## Mac continuation — 17 November 2026

Implemented the five prior priorities: pending-work sign-out protection, queue-aware maintenance/flight/correction recovery, keyboard correction and visible confirmed deletion, maintenance/AD/reading draft guards, and item-specific web status anchors. Independent source re-review reached **31/40 (provisional)**. Added two resumable-write fault tests; **773 tests pass**, both apps typecheck, and final mobile build passes with existing bundle warnings.

Rendered verification is still blocked. CUA denies Chrome even after user-confirmed approval and session reset, and reports browser host unavailable. The local web server also returns HTTP 500 because apps/web has no configured Supabase URL/key. Mobile .env points at production; do not use it for test writes. Resume with a connected browser and isolated web test configuration, then verify desktop/phone/tablet, keyboard/focus, modal exits, partial saves, sign-out and status anchors. The temporary dev server was stopped.

Remaining source priorities: preserve ordinary flight drafts before Save across tab navigation; prioritize annual-date/current-hours setup before bulk scanning. Active/failed saves now have guarded modal recovery, but neither ordinary drafts nor retry closures survive process termination. No commit, deployment or release was performed.


## Playwright visual verification — 17 November 2026

Installed the curated `playwright` skill with the skill-installer Git method (Python download had a local certificate-chain error). The MCP tools were not exposed in this session. Terminal-launched Playwright and the installed skill's CLI successfully launched Chromium, including a visible browser. The earlier CUA denial no longer blocks this route.

Public web: homepage, login and help returned 200 at 1440, 768, 390 and 320px with no page errors or horizontal overflow. Inspected screenshots; mobile navigation opens, Escape closes it and restores focus. Full homepage captures were taken after scrolling/decoding lazy images. Existing screenshot previews are small on phones; full-size image links remain available.

Mobile component fixtures: real Record, ReadingEditor, ItemEditor and Modal code rendered using a temporary Vite harness with synthetic data and mocked local storage/queue services. No backend writes occurred. Checked 320/390/768px in dark/light themes and a 32px root-font stress case. No horizontal overflow or page errors in the final capture matrix. This does not establish full native accessibility or authenticated app integration.

Verified browser interactions: Enter and pointer each step the meter once; failed oil save retains its modal through Escape, keeps background controls out of the tab order, and retries only the unfinished oil step; rejected reading correction remains guarded and retries once; maintenance dirty-dismiss confirmation retains edits when declined, and refresh failure retries without a second mutation. Browser chrome can receive focus during native-dialog Tab cycling, but background app controls cannot.

Found and fixed two runtime/rendered bugs: token proxies crashed React Fast Refresh on symbol inspection; the swipe-delete background extended behind the visible delete link. The proxy now handles ordinary object inspection and has a regression test; the swipe layer is bounded to the reading row. Final checks: **774 tests pass**, web/mobile typechecks pass, mobile build passes with existing chunk warnings, scoped detector returns no findings, diff whitespace check passes.

Evidence and screenshots are under `output/playwright/`, including `record-dark-320.png`, `item-light-320.png`, `flight-recovery-phone.png`, `correction-recovery-phone.png`, `home-390.png` and `home-1440.png`. Fixture source is retained in its `harness/` folder; it uses absolute paths for this Mac. The before screenshot is explicitly named `record-dark-phone-before.png`.

The **31/40 whole-interface score remains provisional**: public pages and selected mobile components now have rendered evidence, but authenticated dashboard/status navigation, sign-out integration, AD editing, actual SQLite/network delivery, iOS/Android WebViews, native screen readers, and process interruption still need verification. Web preview used process-only localhost placeholder Supabase settings so public pages could render; isolated test credentials remain missing. No source environment file, production data, deployment or release was changed. Temporary browser/server sessions were stopped after verification.

## Marketing screenshot refresh — 2026-11-17

Replaced all six shared PNGs in `apps/web/src/screenshots/` with Playwright captures of the current local web UI and the existing N734DM demo. Both `/` and `/demo` consume these assets. Width is 1600 CSS pixels; heights fit the content: review 1474, status 1102, ask 1100, timeline 1589, hub 1194, weight/balance 1102. Completed entrance animations and excluded the Next development indicator. Checked app content containers for clipping; retained the complete navigation and page footer.

The user signed in through Playwright. Local environment lacked service storage credentials, so the review scan was fetched through the production image endpoint with the user's existing authenticated session and supplied to the local browser route. The Ask capture contains an actual answer from the production endpoint for the demo's engine-overhaul question. No aircraft records were edited. No tokens were saved to a storage-state file.

Removed the old-navigation caveat, corrected review/overview alt text, and added accessible full-size image links with visible labels to the product tour. Anonymous browser checks on both marketing pages at 1440, 390 and 320px verified all six images decode, all six full-size links exist, no horizontal overflow and no page errors. Web typecheck and git diff whitespace checks passed. Evidence: `output/playwright/updated-{home,demo}-{1440,390,320}.png`. Not deployed.


## Production PR preparation — 2026-11-17

Release branch `codex/ui-release` starts from current main (`6b76c5c`) and carries the checkpoint plus the Mac fixes, excluding `.impeccable`, installed agent tooling, and local browser outputs. Reconciled conflicts preserve the newer onboarding, records coverage, sharing, and shared maintenance-summary component. Regenerated the six product screenshots against that integrated branch (hub height is now 1179px).

Full review found and fixed skipped local-mirror recovery in EntryEditor/ReviewPane and shortcut identifiers that no longer matched the new sidebar. The new recovery regression test and navigation tests pass. Local validation: 804 unit tests, web typecheck/lint/production build, mobile typecheck/build, marketing Python syntax and shell syntax, archive integrity. Lint has three existing warnings; mobile build retains existing bundle-size warnings. Authenticated compact navigation at 390/768px and anonymous marketing pages at 320/390/1440px pass overflow, link/image, and keyboard-focus checks. PR #254 runs CI, E2E, Semgrep and CodeQL before merge. No database migration. Native store binaries remain a separate release; this PR's web rollout does not update installed native apps.
