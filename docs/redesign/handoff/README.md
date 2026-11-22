# MyTailLog redesign · Handoff package (direction D, "Tabbed Binder")

This folder is everything a coding agent (or a team) needs to build the redesigned MyTailLog: the web app, a native iOS/iPadOS app in SwiftUI, and a native Android app in Jetpack Compose. It replaces the current Capacitor mobile app. It specifies the product rules, the design language, every component, every screen on every platform, every flow, the new capabilities, the data and API changes, the line map, accessibility, motion, copy, and a phased build plan with acceptance criteria.

**Start here, then read in order.** Each file opens with its purpose and contents and ends with acceptance criteria. Where documents conflict, 14-decisions.md has the answer; otherwise follow the precedence in 00-product-principles.md §7.

| # | File | What it settles | Read when |
|---|---|---|---|
| 00 | [00-product-principles.md](00-product-principles.md) | Who it's for, the 9 non-negotiable rules, design principles, the direction in one page | First, always |
| 01 | [01-design-tokens.md](01-design-tokens.md) + [tokens.json](../../../packages/shared/tokens/tokens.json) | Colour (light and dark), type, space, radius, elevation, icons, motion tokens; per-platform mapping | Before writing any UI |
| 02 | [02-components.md](02-components.md) | Every component: anatomy, props, states, behaviour, a11y, web/iOS/Android notes | Before building screens |
| 03 | [03-information-architecture.md](03-information-architecture.md) | Web shell, rail, sections and sub-tabs, spine navigation, shortcuts, route table, redirects from today's URLs, deep links and URL state, roles, responsive bands | Before routing |
| — | [screen-index.md](screen-index.md) | All 109 screens (W-, M-, T-) with their mockup links and spec file | Finding any screen |
| 04 | [04-web-screens.md](04-web-screens.md) | Every web screen (W-…): layout, bindings, states, interactions, copy, acceptance | Building the web |
| 05 | [05-mobile-architecture.md](05-mobile-architecture.md) | Native iOS and Android architecture: Kotlin Multiplatform core, navigation, offline store and sync, files, auth, background work, push, widgets, Live Activities, App Intents, scanning, tach reading, accessibility, testing, release and migration from Capacitor | Before starting either app |
| 06 | [06-mobile-screens.md](06-mobile-screens.md) | Every phone and tablet screen (M-…, T-…) with iOS and Android specifics | Building the apps |
| 07 | [07-flows.md](07-flows.md) | End-to-end flows across platforms, step by step, with edge cases | Planning features, writing E2E tests |
| 08 | [08-capabilities.md](08-capabilities.md) | Every capability, existing and new, with rules and the screens that use it | Scoping and backlog |
| 09 | [09-data-and-api.md](09-data-and-api.md) | Data model changes (Supabase migrations), the due engine, projections, APIs, sync protocol, permissions | Before backend work |
| 10 | [10-line-map.md](10-line-map.md) | The map: data model, scales, layout, drawing, labels, interaction, a11y, rendering on each platform | Building Spine, RouteMap, LineAhead |
| 11 | [11-accessibility-and-motion.md](11-accessibility-and-motion.md) | Accessibility rules and testing; motion tokens, choreography, haptics | Throughout; before each release |
| 12 | [12-copy-and-voice.md](12-copy-and-voice.md) | Voice, vocabulary, banned words, status and date grammar, recurring strings, notifications, empty states, errors | Writing any string |
| 14 | [14-decisions.md](14-decisions.md) | The single answer for every conflict found between files in review; ranks right after 00 | Before building anything, and whenever two files disagree |
| 13 | [13-build-plan.md](13-build-plan.md) | Phases, order of work per platform, migration from the current app, testing, definition of done | Planning the work |

## The visual reference (mockups)
The mockups are static HTML in `docs/redesign/`. Open them in a browser (they need no server). They are reference, not source: build from these specs and tokens, not by copying mockup CSS.
- **Direction D overview:** `docs/redesign/d/index.html` — the system, the map vocabulary, the spine, how B and C combine.
- **Direction D web:** `docs/redesign/d/web.html` — 20 screens (Status, line ahead, Plan ahead, Logbooks map, interchange, gap, entry with spine, review desk, search and Ask on the map, share, dossier, first-run).
- **Direction D phone and tablet:** `docs/redesign/d/mobile.html` — 22 screens (home with line ahead, vertical map, entry sheet, interchange cards, gap sheet, plan ahead, scan, review, widgets, tablet split views).
- **Direction B (the base):** `docs/redesign/b/web1.html`, `b/web2.html`, `b/mobile.html` — every screen D did not redraw (settings, account, documents, maintenance sub-pages, auth). In D these gain the spine under the board head and D's tokens.
- **Gallery parameters:** append `?only=<figure-id>` to isolate a screen, `&open=1` to expand notes, `&bare=1` to hide gallery chrome (used for screenshots). Figure IDs are mapped to screen IDs in [screen-index.md](screen-index.md).
- **Research and rationale:** `docs/redesign/index.html` (the four directions compared), `docs/redesign/research/*.md` (inventories of the current web and mobile apps, competitor notes, the mockup brief with the demo aircraft N734DM's data).
- Published proposal (private, owner's account): https://claude.ai/artifact/Edyo7n8SPfybVnzUSTiH7c

## How to use this with a coding agent
1. Give the agent this folder and the repository. Tell it to read 00, 14, 01, 03, 09 and 13 fully before writing code (plus 05 before any phone work), and to follow 13's phases in order. `_WRITERS-BRIEF.md` is the brief the package was written from; it is background, not a spec.
2. Work one phase at a time. Each phase in 13 lists the documents and screen IDs it covers and its exit criteria. Ask the agent to tick the acceptance checklists from the relevant files in its PR description.
3. Native apps are new projects (`apps/ios`, `apps/android`). The Capacitor app (`apps/mobile`) stays in service until both native apps reach parity (13-build-plan.md, migration).
4. When something is unspecified: decide by 00-product-principles.md, record the decision in the PR, and add it to the relevant file's open questions.
5. Never relax the non-negotiable rules (00 §3) for convenience; tests in 13 enforce them.

## Conventions used in these documents
- **Screen IDs:** `W-` web, `M-` phone, `T-` tablet, followed by section and number (W-STATUS-01). Listed in screen-index.md; used everywhere.
- **Component names** are PascalCase (Board, Leaf, Spine, RouteMap) and defined in 02.
- **Token names** are dotted (color.alarm, type.web.body, map.stop-radius) and defined in 01 / tokens.json.
- **Copy** in quotation marks is exact UI text; string keys are in 12.
- **Demo data:** N734DM, a 1978 Cessna 172N, is used in every example. Its data is invented.
- "Must", "never" and "always" are requirements; "should" is a strong default that may be overridden with a recorded reason.

## What changed from the current app (summary)
- Navigation: six sections in a tabbed binder (Status, Logbooks, Maintenance, Aircraft, Documents, Share) replace the current mixed top navigation; every board carries a spine that places the screen in the aircraft's life.
- Logbooks open on a route map; entries open beside their scanned page; a Review desk confirms AI readings field by field.
- Status leads with the Verdict sentence and the line ahead; Plan ahead (24 months with a date scrubber) replaces Forecast and Pick a date; suggested shop visits bundle due items.
- Mobile becomes native: SwiftUI and Compose apps with offline store and sync, document-scanner capture, widgets, Live Activities / ongoing notifications for reading progress, App Intents / App Actions shortcuts, tablet split views.
- New capabilities include gap tracking with "no pages exist" marking, interchanges (multi-book visits), suggested visits, annual prep packet, squawk link for mechanics, record room view counts and expiries, scheduled backups, keyboard-first review, full theming with a dark mode. The full list with status (existing, changed, new) is in 08-capabilities.md.
