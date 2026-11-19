# 14 · Decisions register

Five authors wrote this package in parallel. An independent review then compared every file against every other and listed the places where two files would lead a builder to two different results. This file records the single answer for each. **Where any other document disagrees with an entry here, this file wins** (it ranks directly after 00-product-principles.md). The most visible occurrences have been corrected in place. If you find a leftover that disagrees with this register, follow the register and fix the leftover in your PR.

Contents: 1 Data and behaviour · 2 The map · 3 Copy · 4 Accessibility, sizes and motion · 5 Tokens · 6 Native specifics · 7 Gaps filled

## 1. Data and behaviour
| # | Topic | Decision | Owner |
|---|---|---|---|
| D1 | Links offline | Making, extending or revoking a record room link or a mechanic (squawk) link is **online only and never queued**. Offline, the control is disabled with its reason ("Making a link needs signal."). Revoking is immediate and online. | 09 §5.3, 05 §6.5 |
| D2 | Mutation names | Use 09 §5.3's names everywhere: `squawkPhoto.create` / `squawkPhoto.delete` (not `squawk.addPhoto/removePhoto`), `visit.create` (not `visit.book`), `visit.setStatus {cancelled}` (not `visit.cancel`), `gap.setStatus` / `gap.create` (not `gap.mark`). There is no `squawk.share` or `recordRoom.*` mutation. | 09 |
| D3 | Enum values | Trust: `ai_read` · `confirmed` · `signed`. Due status: `overdue` · `due_soon` · `current` · `no_record` (plus the `advisory` flag). Visit status: `suggested` (derived) · `planned` · `in_shop` · `awaiting_records` · `done` · `cancelled`. Gap status: `open` · `asked_previous_owner` · `no_pages_exist` · `dismissed` · `filled`. Components use these values (02's `'ai'`, `'soon'`, `'unknown'`, `'booked'` are superseded). | 09 |
| D4 | Situations (home) | Chosen by 09 §3.6 exactly: annual month = annual due within 60 days; in the shop = owner override or a visit with status `in_shop`; preparing a sale = override or a live buyer record room. The owner **can** set or clear "in the shop" and "preparing a sale" by hand. "Offline with changes waiting" is not a situation; it is the OfflineBar shown above any situation. | 09 §3.6 |
| D5 | Plan ahead horizon | 24 months, fixed, on every platform, with the first 6 months drawn at double scale. No 6/12/24 presets. | 09 §3.4 |
| D6 | Widget horizon | 60 days, fixed. The widget configuration chooses the aircraft only. | 09 §3.4 |
| D7 | Notification limits | Due reminders: a lead, a lapse, and up to 8 weekly reminders while lapsed per due cycle; at most one push and one email digest per user per day; quiet hours 21:00 to 07:00. Reading-done and sync-conflict pushes are separate (one per batch / per conflict) and are not counted in the daily cap. "Remind me Friday" snoozes to the coming Friday 09:00 local. | 09 §3.11, 08 §3.17 |
| D8 | AI allowance | Rolling 24 hours: shared key 100 calls (about 50 pages); owner's own key 1,000 calls. Ask has its own cap of 30 questions per user per rolling 24 hours, separate from page reading. | 09 §4.8 |
| D9 | Upload limits | Pages ≤ 12 MB, photos ≤ 6 MB, documents ≤ 25 MB. Copy uses the limit that applies: "This file is larger than {limit} MB." | 09 §5.6 |
| D10 | Web offline | The web shows the OfflineStrip, disables write controls with their reason, and keeps pages added on W-BOOKS-06 in the browser until they upload. It has no general offline write queue. | 03 §16 |
| D11 | Native online-only controls | Disabled with a one-line reason (not enabled-then-toast). | 05 §6.5 |
| D12 | Phone visit screen | Matches 09 and W-STATUS-03: statuses Suggested · Planned · In the shop · Awaiting records · Done; "Book this visit" creates a `planned` visit with week, provider (Select from service providers, or a new one) and notes; "Send to {provider}" is offered for planned visits and makes a 30-day mechanic link (online) and opens the share sheet with the list and link. | 04, 09 |
| D13 | Visit capsule styles | Suggested: dashed ink, leaf-2 fill. Planned: solid ink, leaf-2 fill. In the shop: solid `section-ink` 3px, leaf-2 fill. Done: an ordinary interchange. | 10 §6 |
| D14 | Offline scan cache | Default 1 GB, owner adjustable; documents are never purged. | 05 §7 |
| D15 | Widget staleness | Shows "as of {time or day}" when the data is older than 24 hours. | 05 §11 |
| D16 | Squawk severity | Low · Watch · Ground, **no default** (the owner must choose); meanings as 08 §3.8. | 08 |
| D17 | Viewers on the phone | Viewers see the AddButton with one item, "Report a squawk". | 09 §5.3 |
| D18 | Record room expiry changes | "Extend 30 days" (repeatable up to 180 days from creation) on every platform; no free date picker. | 08 §3.16 |
| D19 | Gap sheet actions (phone) | Same as web: Scan these pages · Ask the previous owner · No pages exist · Not a gap (in the overflow menu). | 08 |

## 2. The map
| # | Topic | Decision |
|---|---|---|
| M1 | The Other logbook | Not drawn as a line on the Spine, RouteMap or LineAhead. Its entries are reachable from Logbooks › Pages, the list view and search. Lanes: Airframe, Engine, Propeller, Avionics (only those that exist). |
| M2 | Stops | Every stop has a leaf fill and an ink stroke; read-by-AI stops have a **dotted** stroke (dash 2 2.5). "Hollow" in other files means this; there are no solid-filled stops. Signed stops look like confirmed ones on the map; the diamond appears in the stop's detail. |
| M3 | Spine on the web | Not a single link. Click before today opens Logbooks › Map at ±2 years around the point; click after today opens Status › Plan ahead at that date; drag selects a range on map screens; keyboard model per 10 §10 and 03 §7.2. |
| M4 | Section colour on leaves | Never use a raw section hue on a leaf. Where a map needs the section's colour (DateScrubber window, in-shop capsule, selection ring) use `section-ink` (01) at the stated opacity. |
| M5 | Phone spine | Drawing per 02 (leaf fill on leaves; on the cover-coloured header the cover-2 fill variant). Placements are 06's: M-STATUS-01 header, M-BOOKS-02 (with previous / next stop chevrons), M-REVIEW-01, M-SCAN-03, M-SCAN-04, M-ASK-01, hangar rows (display only). |
| M6 | Hit-area ties | When two map hit areas overlap within 6pt / 6dp of both centres, show a small picker listing both. |
| M7 | DateScrubber steps | Web: arrow = 1 day, Page Up/Down = 1 month, Home/End = today/horizon. iOS and Android adjustable actions step 1 month (haptic detent per month). |

## 3. Copy (12-copy-and-voice.md is updated to match)
| # | Topic | Decision |
|---|---|---|
| C1 | Status words | Current · Due soon · Overdue · **No record** · Advisory. Never "Unknown" or "Needs information" as a status word. (A field the owner must fill may still say "Needs a date".) |
| C2 | Overdue wording | "lapsed 7 days ago" (never "7 days over"). |
| C3 | Verdict | The grammar and situation variants in 12 §4. The Verdict carries no offline, freshness or squawk wording; those are separate second lines (12 §4, items 5 to 7). |
| C4 | Review outcomes | Web: "Confirm {value}" (A), "Edit" (E), "Not on this page" (X), Enter confirms the field and moves on, Shift+Enter confirms the page and goes to the next. Phone: "Looks right", "Edit", "Not on this page"; "Confirm page and next". |
| C5 | Allowance | `allowance.today` / `allowance.byo` / `allowance.wait` strings in 12 §7 everywhere ("31 of 50 pages read in the last 24 hours"). Never "today", "resets at midnight" or "no limit". |
| C6 | Add menu | Six items, this order: Log a flight · Add oil · Scan logbook pages · Report a squawk · Add a document · Write a logbook entry. Submit buttons: "Report squawk". |
| C7 | "signal" vs "connection" | Phone copy says "signal" (owners at the airfield say it); web copy says "connection". |
| C8 | Theme names | Settings › Appearance: Match system · Light · Dark. Default: Match system. |
| C9 | Banned links | "Learn more" is replaced by a link naming its destination ("Read the announcement"). |
| C10 | Relative time | Days up to 90 days ("in 43 days", "3 days ago"); months up to 12 months; the date beyond. The absolute date is always shown nearby. |

## 4. Accessibility, sizes and motion
| # | Topic | Decision |
|---|---|---|
| A1 | Sub-tabs (web) | Links with `aria-current="page"` inside a `nav` (each sub-tab has its own URL); not an ARIA tablist. Arrow keys are not required. |
| A2 | Verdict | An `h2` directly after the board title. |
| A3 | Dialog focus | Ordinary dialogs focus their heading. Destructive confirmations focus the safe action ("Cancel", "Keep link"). |
| A4 | Text below 13px | Allowed only at 12px for map ticks, the phone tab label, KeyHint chips, count badges and the "first" badge, each at weight 600 or more and contrast 4.5:1 or more. |
| A5 | Phone body size | iOS uses the `.body` text style (17pt at the default size); Android `bodyLarge` (16sp). The 16 in tokens.json `type.phone.body` is the Android and web reference value; iOS maps to the system style. |
| A6 | Toasts | 6 s; 10 s with an action; 20 s while a screen reader runs; pause on hover or focus. |
| A7 | Stepper buttons | Log a flight's − and + are 64pt / 64dp. |
| A8 | Web targets | 24×24 minimum for any target; 40×40 for primary actions, rail tabs and table row actions at every width. |
| A9 | Default theme | Match system (C8). The light theme remains the design reference; outdoor legibility is met in both themes. |

## 5. Tokens
| Used in other files | Use instead |
|---|---|
| `color.alarm-ink` | `color.alarm-text` |
| `color.alarm-ink-strong` | `color.on-alarm-bg` |
| `color.control-edge` | `color.control-border` |
| secondary button border `rule-2` | `color.control-border` |
| `type.numeric` | the size's own type token with tabular figures (`font-variant-numeric: tabular-nums`; iOS `.monospacedDigit()`; Android `fontFeatureSettings = "tnum"`); tokens.json `font.numeric-features` |
| `motion.fast / base / slow` | `motion.duration-fast / -base / -slow` with `motion.ease-out` / `motion.ease-in-out` |
| `radius.round`, `radius.pill`, `border.*` | added to tokens.json (`radius.round` 50%, `radius.pill` 999px, `border.control`, `border.rule`, `border.focus`) |
| SectionTab maximum | 180px (`size.section-tab-max`); the 300px free-height cap in 02 applies to the whole column |

## 6. Native specifics
- Native type, icon and tab-bar decisions: 05 §5 and 01 §8 (Lucide everywhere, platform symbols only for OS chrome; D's own PhoneTabBar).
- Sync line wording comes from 12 §7 (`sync.*`); short forms for the header are `sync.short.waiting` "{n} waiting" and `sync.short.conflict` "{n} to decide".

## 7. Gaps filled
- Ask cap: 30 questions per user per rolling 24 hours (D8).
- Push cap scope: D7.
- Phone gap sheet: D19. Hit-area ties: M6. Scrubber steps: M7.
- Record room expiry: D18. SectionTab maximum: §5.
- Open questions in 02, 05 and 06 that these decisions answer are closed by this register.

## 8. Kickoff decisions (owner, 2026-11-18)
| # | Topic | Decision |
|---|---|---|
| K1 | Shared phone code | Kotlin Multiplatform core (05 §4.2) with fully native SwiftUI and Compose UIs. The GRDB/Room fallback is not used. |
| K2 | Minimum OS | iOS/iPadOS 18, Android 10 (API 29). |
| K3 | PDF for dossier and summary | Keep today's approach: print stylesheets and the browser's "Save as PDF" (phones print the same web page with the system print sheet). No server-side PDF renderer for now; 13 §5 phase 5's "render server-side to PDF" is deferred until owners need a generated file. |
| K4 | Time zone | No `aircraft.time_zone`. The user's time zone is captured automatically from the browser and phone (`profile.time_zone`, IANA name, no settings control) and is used for "today" in the due engine and status snapshot, quiet hours, "Remind me Friday" and the daily digest. UTC when unknown. Closes 09 open question 7. |
