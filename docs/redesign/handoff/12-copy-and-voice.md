# 12 · Copy and voice

MyTailLog speaks like a careful records clerk who also flies: exact, brief, unhurried, never salesy, never alarmed unless something is overdue. The logbook speaks in its own voice (Literata) and the app never puts words in its mouth. This file sets the voice, the vocabulary, the patterns for every kind of string, and the exact copy for the strings that recur across screens. Screen-specific copy lives in 04-web-screens.md and 06-mobile-screens.md; when they disagree with this file on a recurring string, this file wins.

Contents: 1 Voice · 2 The two voices on screen · 3 Words we use and words we never use · 4 Status and dates · 5 Numbers, units and formats · 6 Patterns by string type · 7 Recurring strings · 8 Notifications · 9 Empty states · 10 Errors · 11 Legal and safety lines · 12 Localisation · 13 Acceptance criteria

## 1. Voice
- **Exact.** "Annual due Dec 31, 2026" not "Annual coming up soon". Name the item, the date, the hours, the page.
- **What the records show, not what is true.** "The records show nothing tracked is overdue." The app never says the aircraft is airworthy, legal, safe, compliant, grounded or ready to fly.
- **Plain owner words.** Tach, hobbs, annual, 100-hour, AD, squawk, A&P, IA, W&B, STC, 337, TBO, SMOH. No software words: no "sync conflict resolution", "entity", "record ID", "workspace", "dashboard", "AI-powered", "smart", "insights", "seamless", "unlock".
- **Short.** Sentences under 20 words. Buttons 1 to 4 words, verb first. Headings are nouns or questions, not slogans.
- **Calm.** No exclamation marks except in a single first-run welcome. No "Oops", no "Uh-oh", no emoji, no jokes in errors.
- **Second person, active voice.** "You confirmed 12 entries." "We" only for the service doing something on the owner's behalf ("We'll email you the export").
- **Sentence case** everywhere: titles, buttons, tabs, menu items. Proper nouns and logbook names keep capitals (Airframe logbook, Engine logbook).

## 2. The two voices on screen
| | App voice | Paper voice |
|---|---|---|
| Typeface | Libre Franklin (SF Pro / Roboto acceptable on phones for chrome; Libre Franklin for content) | Literata |
| Content | Everything the app says, computes, labels or concludes | Only words transcribed from a scanned page, verbatim, including the mechanic's abbreviations and spelling |
| Edits | Copy is ours | Never corrected silently. If the owner fixes a transcription, the original reading is kept in history |
| Quotation | — | Shown without quotation marks, in Literata, optionally with "Logbook says:" for screen readers |
| Example | "Annual inspection · Aug 22, 2011 · confirmed by you" | Annual insp IAW FAR 43 App D. Found airworthy. Tach 2104.6 |
Mechanics write "found airworthy" in logbooks. That phrase may appear in the paper voice because it is quoted; the app voice never repeats it as its own conclusion.

## 3. Words we use and words we never use
| Use | Instead of |
|---|---|
| Status (section), "what the records show" | Dashboard, health, airworthiness |
| Logbooks | Records library, documents (documents means registration, POH, insurance etc.) |
| Entry | Record, item (an entry is one logbook entry) |
| Page | Image, file, scan (a scan is the act; the page is the thing) |
| Tracked item | Task, reminder, rule |
| Due, due soon, overdue, no record | Expired, failing, red, critical, grounded, non-compliant |
| Lapsed (for a past due date) | Expired (except documents: "Registration expired Mar 3") |
| Read by AI / confirmed by you / signed by a mechanic | Unverified, verified, approved, validated |
| Squawk | Issue, ticket, defect (mechanics may say discrepancy; use squawk in UI, "discrepancy" acceptable in the maintenance summary export) |
| Shop visit (planned / suggested) | Appointment, work order |
| Record room | Portal, share link, data room |
| Map, line, stop, gap, visit | Graph, timeline chart, node |
| Ask | Chat, assistant, copilot |
| AI reading allowance | Credits, tokens, quota |
| Mechanic, A&P, IA | Technician, vendor, provider |
| Co-owner (editor), Viewer | Collaborator, member, seat |
Squawk severities are the owner's own labels: Low, Watch, Ground. "Ground" is allowed there because the owner chose it; the app never turns it into a verdict ("grounded").

Never: airworthy, legal (as a status), compliant, grounded, safe to fly, certified (for anything the app produces), guaranteed, 100% accurate, smart, magic, revolutionary, seamless, effortless, AI-powered, insights.

## 4. Status and dates
- **Status words** (always paired with StatusMark): Current · Due soon · Overdue · No record · Advisory. On the item line, the status word is followed by the reason: "Due soon · 43 days" / "Overdue · lapsed 7 days ago" / "No record · no entry found for this item".
- **Due soon** (09 §3.2): 90 days or 10 hours left; VOR check 5 days; tracked documents 60 days (per-document lead). Reminder leads are separate (08 §3.17): annual 90 days, oil 10 h, ADs 30 days or 25 h, documents 60 days, others 30 days or 25 h.
- **Both limits:** "Due Dec 31, 2026 or 2,175.0 tach, whichever first" with the first one marked: "Dec 31, 2026 (first)". Projected hours: "about Feb 14 at your recent 1.4 h a week". Granularity by distance (09 §3.3): up to 120 days "about Dec 12"; 121 to 540 days "about Apr 2027"; beyond "about 2030". The basis is named when it is not the last 90 days of tach: "from hobbs", "from the past year", "from your estimate". No basis: "{n} h left, no recent flying to date it".
- **Calendar-month items:** "Due end of December 2026 (Dec 31)".
- **Relative time:** up to 90 days use days ("in 43 days", "3 days ago"); up to 12 months use months ("in 4 months"); beyond, use the date. Always show the absolute date nearby (tooltip on web, second line on phones).
- **The Verdict** (Status board, phone home, widgets) follows a fixed grammar:
  1. Overdue present: "1 item is overdue: Transponder check lapsed 7 days ago." / "3 items are overdue."
  2. Else due soon present: "Nothing tracked is overdue. Next: oil change in about 9.7 hours."
  3. Else: "Nothing tracked is overdue. Next: annual, Dec 31, 2026."
  4. No records yet: "Nothing to show yet. Scan or add your logbooks to see what's due."
  5. With unconfirmed entries waiting: append a second line, never merged into the verdict: "18 entries read by AI are waiting for you. They don't count until you confirm them."
  6. Stale meter reading (over 30 days): append "Hours are from your last tach reading on Sep 2. Log a flight to update."
  7. A squawk marked Ground: a separate second line, "A squawk is marked Ground: {title}." Missing carry-aboard documents likewise: "{document} isn't in Documents."
  8. Freshness (phones, offline or last pull older than 6 hours) is the sync line under the tail number, never part of the Verdict.
  - **Situation variants** (09 §3.6), first sentence replaced, second sentence as above:
    - Overdue with a scope: "1 item has lapsed: {item}, {ago} ({scope})." e.g. "1 item has lapsed: VOR check, 7 days ago (IFR only)."
    - All clear: "Nothing tracked is due in the next 90 days. Next: {item}, {when}."
    - Annual month: "The annual is due by {date}. {n} items can ride along."
    - In the shop: "{tail} is at {provider} for {items}, since {date}."
    - Preparing a sale: "A buyer's record room is open until {date}. {n} items are due before then."
    - Setup: verdict.empty.
- **Dates:** "Dec 31, 2026" (US default), "Aug 22, 2011" for history; month-only "Aug 2011" on map ticks; never numeric-only dates in the UI except in inputs. Week starts follow locale.

## 5. Numbers, units and formats
| Thing | Format | Example |
|---|---|---|
| Tach / hobbs | one decimal, thousands separator, "tach"/"hobbs" after | 2,165.3 tach |
| Hours remaining | one decimal + "h" | 9.7 h |
| Time since overhaul | "h since overhaul" (SMOH in tight spaces) | 1,409.4 h since overhaul |
| Days | integer + "days" | 43 days |
| Money (exports only) | locale currency | $1,240.00 |
| Page citations | "Airframe vol. 2, p. 41" | |
| AD numbers | as published | AD 2011-10-09 |
| Counts | numerals always | 3 items |
| Fractions of an allowance | "34 of 50 pages read today" | |
| Percentages | avoid; use counts ("120 of 340 pages confirmed") | |

## 6. Patterns by string type
- **Buttons:** verb + object. "Log a flight", "Scan pages", "Confirm entry", "Open the page", "Share records", "Plan a visit", "Revoke link". Primary button never "OK", "Submit", "Continue" alone (use "Continue to review" etc.). Cancel is "Cancel"; closing a read-only sheet is "Done".
- **Destructive confirmations:** title is the question with the object: "Revoke this record room link?"; body states the consequence: "Anyone with the link loses access right away. You can make a new link later."; buttons "Revoke link" (destructive) and "Keep link".
- **Toasts:** past tense, with undo where reversible: "Entry confirmed. Undo" / "Flight logged: 1.4 h. Undo".
- **Hints and first-use explanations:** one sentence, dismissible: "An interchange is one shop visit that signed more than one logbook."
- **Labels:** nouns, no colons in visual labels. Units in the field suffix, not in the label.
- **Placeholders:** examples only, never instructions: "e.g. 2165.3".
- **Links:** describe the destination: "Open the map", "See the page", not "Click here" or "Learn more".
- **Headings on leaves:** what the leaf shows: "Due next", "Entries on this page", "What the records show".
- **AI disclosure:** wherever AI produced text, label it once per block: "Read by AI from page 41. Check it against the page." Ask answers begin with the answer and end with their citations; when the records do not say: "The confirmed entries don't mention this. Unconfirmed entries may: review them first."

## 7. Recurring strings
| Key | String |
|---|---|
| verdict.clear.next | Nothing tracked is overdue. Next: {item} {when}. |
| verdict.overdue.one | 1 item is overdue: {item} lapsed {ago}. |
| verdict.overdue.many | {n} items are overdue. |
| verdict.empty | Nothing to show yet. Scan or add your logbooks to see what's due. |
| verdict.unconfirmed | {n} entries read by AI are waiting for you. They don't count until you confirm them. |
| trust.ai | Read by AI |
| trust.confirmed | Confirmed by you |
| trust.signed | Signed by a mechanic |
| status.current / soon / overdue / norecord / advisory | Current / Due soon / Overdue / No record / Advisory |
| limit.first | first |
| projection.about | about {date} at your recent {rate} h a week |
| projection.none | {n} h left, no recent flying to date it |
| projection.basis.hobbs / year / estimate | from hobbs / from the past year / from your estimate |
| line.undated | Not on the line: {label}, needs a date |
| sync.waiting | {n} changes waiting to sync |
| sync.offline | Offline. Changes are saved on this phone. |
| sync.conflict | {n} changes need a look |
| sync.done | All changes synced |
| allowance.today | {used} of {limit} pages read in the last 24 hours. Each page frees up 24 hours after it was read. |
| allowance.wait | Waiting for tomorrow's allowance, about {time} |
| allowance.byo | Reading with your own AI key: up to 1,000 reading calls in any 24 hours. |
| ask.cap | {used} of 30 questions asked in the last 24 hours. |
| disclaimer.short | The paper logbooks are the legal record. MyTailLog is an index. |
| map.gap | No pages, {from} to {to} |
| map.gap.marked | No pages exist for {from} to {to} (you marked this) |
| map.today | Today |
| map.list | Show as list |
| map.drawing | Show as map |
| spine.open | Open the map |
| share.room.expires | Expires {date}. Opened {n} times. |
| share.room.revoked | Revoked {date}. The link no longer works. |
| review.progress | {done} of {total} fields checked on this page |
| empty.nothing | Nothing here yet. |
| review.confirm.web | Confirm {value} |
| review.confirm.phone | Looks right |
| review.edit / review.absent | Edit / Not on this page |
| visit.book | Book this visit |
| add.menu | Log a flight · Add oil · Scan logbook pages · Report a squawk · Add a document · Write a logbook entry |
| squawk.submit | Report squawk |
| sync.short.waiting / sync.short.conflict | {n} waiting / {n} to decide |
| theme.options | Match system · Light · Dark (default Match system) |

## 8. Notifications
Notifications carry the whole answer so the owner need not open the app: the item, the limit that comes first with its date or hours and projection, the other limit, who did it last and on which page, and the visit that covers it. Never at night: quiet hours (default 21:00 to 07:00 local) delay pushes to the end of the window. At most one push and one email digest per user per day; several items for one aircraft on one day become one notification listing up to 3 and "and 2 more" (08 §3.17, 09 §3.11). Kinds: lead, lapse, weekly while lapsed (at most 8), visit, visit at risk, document, reading done.
| Trigger | Title | Body |
|---|---|---|
| Several items fit one visit | N734DM: three items fit one visit, week of Dec 7 | Oil change in 9.7 h (about Dec 12), transponder and pitot-static by Dec 31. AeroCheck Instruments did the last two on Dec 3, 2024, Airframe p. 58. |
| Item enters its lead | Annual due Dec 31 | 43 days left. Last done Dec 18, 2025, Airframe vol. 2, p. 52. |
| Hours item enters due soon | Oil change in about 9.7 h | About Dec 12 at your recent use. Last change at 2,155.6 tach. |
| Item lapses | Transponder check lapsed | Due Nov 30, 2026. The records show no newer check. |
| AI finished reading | 34 pages read | 112 entries are ready to review. They don't count until you confirm them. |
| Allowance reached | Reading paused until {time} | 50 of 50 pages read in the last 24 hours. The next 28 pages start reading about {time}. |
| Record room opened (opt-in, in the inbox only) | Your record room was opened | The link for "Pre-buy, Dec 2026" was opened at 2:14 pm. |
| Squawk reported by mechanic link | New squawk on N734DM | "Left brake soft." From the squawk link you shared. |
| Sync conflict | A change needs a look | Your edit to the Dec 2 flight conflicts with one from Dana's phone. |
Actions on notifications (09 §4.9): "Plan the visit", "Remind me Friday" (snoozes to the coming Friday 09:00 local), "Review" (reading done). Tapping the notification opens its deep link. Widgets and Live Activities (06-mobile-screens.md) use the Verdict grammar shortened: "Nothing overdue · Oil in ~9.7 h".

## 9. Empty states
Pattern: what this place is for (one sentence) + the one action that fills it + optionally a secondary route. No illustrations of aircraft cartoons; use the section's line motif or nothing.
| Place | Copy | Action |
|---|---|---|
| Status, no records | Nothing to show yet. Status fills in as your logbooks are read and confirmed. | Scan pages |
| Logbooks, none | Add your first logbook. Most owners start with the airframe log, newest volume first. | Add a logbook |
| Map, no dated entries | The map draws itself from dated entries. None yet. | Scan pages |
| Review desk, nothing waiting | Nothing waiting for review. | Back to Logbooks |
| Squawks, none | No open squawks. | Add a squawk |
| Documents, none | Keep registration, airworthiness certificate, POH, insurance and W&B here. | Add a document |
| Share, none | Share records with a mechanic, a buyer or an insurer. They don't need an account. | Make a record room |
| Search, no results | No entries match "{q}". Try a shorter word, or ask a question instead. | Ask instead |
| Ask, records silent | The confirmed entries don't mention this. | Review unconfirmed entries |
| Offline, AI needed | Reading pages needs a connection. The photos are saved and will be read when you're back online. | — |

## 10. Errors
Pattern: what happened + why if known + what to do. Phone copy says "signal" where web copy says "connection" (14-decisions.md C7). No codes in the main text (code goes in a "Details" disclosure for support).
| Case | Copy |
|---|---|
| Network | Couldn't reach MyTailLog. Your changes are saved here and will sync when you're back online. |
| Blurry scan | This page is too blurry to read. Retake it in better light, or type the entries yourself. |
| Page not a logbook | This doesn't look like a logbook page. Keep it as a document, or retake it. |
| AI provider down | Reading is paused because the reading service isn't responding. We'll retry automatically. |
| BYO key rejected | Your AI key was rejected by the provider. Check it in Settings › AI reading. |
| Permission (viewer) | You can view this aircraft but not change it. Ask {owner} for editor access. |
| Record room expired | This link expired on {date}. Ask the owner for a new one. |
| Record room revoked | This link was turned off by the owner. |
| Upload too large | This file is larger than {limit} MB. Split the PDF or upload pages separately. (Limits: pages 12 MB, photos 6 MB, documents 25 MB.) |
| Session ended | You were signed out. Sign in again to save this change; it's kept until you do. |
| Server error | Something went wrong on our side. Your work is saved. Try again in a minute. |

## 11. Legal and safety lines
- Footer of Status, every export, dossier, maintenance summary and record room: "The paper logbooks are the legal record (14 CFR 91.417). This is an index of them, prepared by the owner with MyTailLog. Check every item against the logbook pages."
- Ask: under every answer, quietly: "Answers come from your confirmed entries. Check the cited pages."
- AD tracking: "AD applicability is for the owner and their mechanic to determine. This list shows ADs that may apply by make, model and serial, and what the records show about them."
- Never imply that confirming an entry is a sign-off: the Review desk header help says "Confirming means the text matches the page. It doesn't sign anything." (The confirm controls themselves read "Confirm {value}" on the web and "Looks right" on the phone.)

## 12. Localisation
- Launch locale en-US; strings externalised from day one (web: ICU MessageFormat via a message catalog; iOS: String Catalogs `.xcstrings`; Android: `strings.xml` with plurals). Keys as in §7.
- Plurals through the platform plural rules, never "item(s)".
- Dates, numbers and units through locale formatters; hours stay in decimal hours worldwide; the regulatory references (14 CFR) are US-specific and switch per registry country when non-US registries are supported (out of scope for v1, keep the strings keyed).
- Allow 35% text expansion in every layout; never fixed-width buttons.

## 13. Acceptance criteria
- [ ] No banned word (§3) appears in any UI string, notification, export or marketing page (a lint script over the string catalogs enforces it).
- [ ] Every AI-produced block carries its disclosure and citations.
- [ ] The Verdict follows §4 grammar on web, phone home, widgets and notifications.
- [ ] Paper-voice text is never edited by the app and is always rendered in Literata.
- [ ] Every error string says what to do next.
- [ ] All strings are externalised with keys; no concatenated sentences.
