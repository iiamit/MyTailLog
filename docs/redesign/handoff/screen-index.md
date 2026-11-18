# Screen index

Every screen in the package, with its canonical ID, the mockup that shows it and the file that specifies it. IDs are used everywhere in this package (flows, capabilities, data, build plan). Mockup paths are relative to `docs/redesign/`; `?only=<figure>` isolates one screen in the gallery (add `&bare=1` to hide the gallery chrome). Screens marked "(added in 06)" have no mockup; build them from their spec in the D system. Web routes for each W- screen are in 03-information-architecture.md §9.

109 screens.

| ID | Screen | Mockup | Spec |
|---|---|---|---|
| W-ACCOUNT-01 | Import and export, backups | `b/web2.html?only=b-w-data` | 04-web-screens.md |
| W-ACCOUNT-02 | Settings | `b/web2.html?only=b-w-settings` | 04-web-screens.md |
| W-ADD-01 | Add menu | spec only | 04-web-screens.md |
| W-AIRCRAFT-01 | Hours and meters | `d/web.html?only=d-w-engine`, `b/web2.html?only=b-w-hours` | 04-web-screens.md |
| W-AIRCRAFT-02 | Oil and engine health | `b/web2.html?only=b-w-oil` | 04-web-screens.md |
| W-AIRCRAFT-03 | Equipment | `b/web2.html?only=b-w-equip` | 04-web-screens.md |
| W-AIRCRAFT-04 | Weight and balance | `b/web2.html?only=b-w-wb` | 04-web-screens.md |
| W-AIRCRAFT-05 | Aircraft details and danger zone | `b/web2.html?only=b-w-details` | 04-web-screens.md |
| W-ASK-01 | Search and Ask | `d/web.html?only=d-w-ask` | 04-web-screens.md |
| W-AUTH-01 | Sign in | `b/web1.html?only=b-w-signin` | 04-web-screens.md |
| W-BOOKS-01 | Map | `d/index.html?only=d-web-map` | 04-web-screens.md |
| W-BOOKS-02 | Map, one book | `d/web.html?only=d-w-map-engine` | 04-web-screens.md |
| W-BOOKS-03 | Map, decade zoom | `d/web.html?only=d-w-map-decade` | 04-web-screens.md |
| W-BOOKS-04 | Gap selected | `d/web.html?only=d-w-map-gap` | 04-web-screens.md |
| W-BOOKS-05 | Pages library | `b/web1.html?only=b-w-pages` | 04-web-screens.md |
| W-BOOKS-06 | Add pages and the reading queue | `d/web.html?only=d-w-queue`, `b/web1.html?only=b-w-addpages` | 04-web-screens.md |
| W-BOOKS-07 | Review desk | `d/web.html?only=d-w-review` | 04-web-screens.md |
| W-BOOKS-08 | Review all | `b/web1.html?only=b-w-reviewall` | 04-web-screens.md |
| W-BOOKS-09 | First read | `d/web.html?only=d-w-firstread` | 04-web-screens.md |
| W-BOOKS-10 | Entry detail | `d/web.html?only=d-w-entry` | 04-web-screens.md |
| W-BOOKS-11 | Write a logbook entry | `b/web2.html?only=b-w-write` | 04-web-screens.md |
| W-BOOKS-12 | List view of entries (B's timeline as a list) | `b/web2.html?only=b-w-timeline` | 04-web-screens.md |
| W-DOCS-01 | Documents vault and carry-aboard card | `b/web2.html?only=b-w-docs` | 04-web-screens.md |
| W-HANGAR-01 | Hangar | `d/web.html?only=d-w-hangar` | 04-web-screens.md |
| W-HANGAR-02 | Add an aircraft | `b/web1.html?only=b-w-add` | 04-web-screens.md |
| W-MAINT-01 | ADs and SBs | `d/web.html?only=d-w-ads` | 04-web-screens.md |
| W-MAINT-02 | Find ADs | `b/web1.html?only=b-w-findad` | 04-web-screens.md |
| W-MAINT-03 | Squawks | `d/web.html?only=d-w-squawks` | 04-web-screens.md |
| W-MAINT-04 | Annual prep | `d/web.html?only=d-w-annualprep` | 04-web-screens.md |
| W-MAINT-05 | Records check: gaps, duplicates, mis-keyed readings | `b/web2.html?only=b-w-audit` | 04-web-screens.md |
| W-MAINT-06 | Tracked items setup (edit intervals, add custom item) | spec only | 04-web-screens.md |
| W-SETUP-01 | First-session setup | `b/web1.html?only=b-w-setup` | 04-web-screens.md |
| W-SETUP-02 | New aircraft, nothing scanned | `d/web.html?only=d-w-new` | 04-web-screens.md |
| W-SHARE-01 | Share hub | `d/web.html?only=d-w-share` | 04-web-screens.md |
| W-SHARE-02 | Record room, recipient view | `d/web.html?only=d-w-room` | 04-web-screens.md |
| W-SHARE-03 | Pre-buy dossier | `d/web.html?only=d-w-dossier` | 04-web-screens.md |
| W-SHARE-04 | Maintenance summary | `b/web2.html?only=b-w-summary` | 04-web-screens.md |
| W-STATUS-01 | What's due, the home | `d/index.html?only=d-web-status` | 04-web-screens.md |
| W-STATUS-02 | Home situations: annual month, all clear, in the shop, preparing a sale | `d/web.html?only=d-w-annual`, `b/web1.html?only=b-w-clear` | 04-web-screens.md |
| W-STATUS-03 | Plan ahead | `d/web.html?only=d-w-plan` | 04-web-screens.md |
| W-STATUS-04 | Item detail with mark-done drawer | `d/web.html?only=d-w-item`, `b/web1.html?only=b-w-item` | 04-web-screens.md |
| W-SWITCH-01 | Aircraft switcher | spec only | 04-web-screens.md |
| M-AIRCRAFT-01 | Aircraft | `b/mobile.html?only=b-m-aircraft` | 06-mobile-screens.md |
| M-AIRCRAFT-02 | Hours and readings | (added in 06) | 06-mobile-screens.md |
| M-AIRCRAFT-03 | Equipment | (added in 06) | 06-mobile-screens.md |
| M-AIRCRAFT-04 | Weight and balance | (added in 06) | 06-mobile-screens.md |
| M-AIRCRAFT-05 | Oil and engine | (added in 06) | 06-mobile-screens.md |
| M-AIRCRAFT-06 | Aircraft details | (added in 06) | 06-mobile-screens.md |
| M-ASK-01 | Search and Ask | `d/mobile.html?only=d-m-ask` | 06-mobile-screens.md |
| M-AUTH-01 | Sign in | spec only | 06-mobile-screens.md |
| M-BOOKS-01 | Map | `d/index.html?only=d-m-map` | 06-mobile-screens.md |
| M-BOOKS-02 | Stop sheet | `d/mobile.html?only=d-m-stop` | 06-mobile-screens.md |
| M-BOOKS-03 | Visit cards | `d/mobile.html?only=d-m-visit` | 06-mobile-screens.md |
| M-BOOKS-04 | Gap | `d/mobile.html?only=d-m-gap` | 06-mobile-screens.md |
| M-BOOKS-05 | One book | `d/mobile.html?only=d-m-engine` | 06-mobile-screens.md |
| M-BOOKS-06 | Books and pages | `b/mobile.html?only=b-m-books` | 06-mobile-screens.md |
| M-BOOKS-07 | Entry | `b/mobile.html?only=b-m-entry` | 06-mobile-screens.md |
| M-BOOKS-08 | Entries as a list | (added in 06) | 06-mobile-screens.md |
| M-BOOKS-09 | Write a logbook entry | (added in 06) | 06-mobile-screens.md |
| M-DOCS-01 | Documents and carry-aboard | `b/mobile.html?only=b-m-docs` | 06-mobile-screens.md |
| M-DOCS-02 | Document viewer | (added in 06) | 06-mobile-screens.md |
| M-DOCS-03 | Add a document | (added in 06) | 06-mobile-screens.md |
| M-FLIGHT-01 | Add sheet | `b/mobile.html?only=b-m-add` | 06-mobile-screens.md |
| M-FLIGHT-02 | Photograph the tach | `b/mobile.html?only=b-m-tach-photo` | 06-mobile-screens.md |
| M-FLIGHT-03 | Confirm the flight | `d/mobile.html?only=d-m-flight` | 06-mobile-screens.md |
| M-FLIGHT-04 | Saved | `d/mobile.html?only=d-m-saved` | 06-mobile-screens.md |
| M-FLIGHT-05 | Add oil | (added in 06) | 06-mobile-screens.md |
| M-HANGAR-01 | Hangar | spec only | 06-mobile-screens.md |
| M-HANGAR-02 | Add an aircraft | spec only | 06-mobile-screens.md |
| M-HANGAR-03 | First setup | (added in 06) | 06-mobile-screens.md |
| M-MAINT-01 | ADs | `b/mobile.html?only=b-m-ads` | 06-mobile-screens.md |
| M-MAINT-02 | Squawk detail | `b/mobile.html?only=b-m-squawk-detail` | 06-mobile-screens.md |
| M-MAINT-03 | New squawk: photo then words | `b/mobile.html?only=b-m-squawk-photo`, `b/mobile.html?only=b-m-squawk-words` | 06-mobile-screens.md |
| M-MAINT-04 | Tracked items | (added in 06) | 06-mobile-screens.md |
| M-MAINT-05 | Squawks | (added in 06) | 06-mobile-screens.md |
| M-MAINT-06 | AD detail and compliance | (added in 06) | 06-mobile-screens.md |
| M-MAINT-07 | Find ADs | (added in 06) | 06-mobile-screens.md |
| M-REVIEW-01 | Review a page | `d/mobile.html?only=d-m-review` | 06-mobile-screens.md |
| M-REVIEW-02 | Doubtful field | `b/mobile.html?only=b-m-review-doubt` | 06-mobile-screens.md |
| M-REVIEW-03 | Next page | `b/mobile.html?only=b-m-review-next` | 06-mobile-screens.md |
| M-SCAN-01 | Choose the logbook | `b/mobile.html?only=b-m-scan-book` | 06-mobile-screens.md |
| M-SCAN-02 | Camera | `d/mobile.html?only=d-m-camera` | 06-mobile-screens.md |
| M-SCAN-03 | Queue | `d/mobile.html?only=d-m-queue` | 06-mobile-screens.md |
| M-SCAN-04 | Pages-read notification | `d/mobile.html?only=d-m-read` | 06-mobile-screens.md |
| M-SHARE-01 | Who is it for | `d/mobile.html?only=d-m-share` | 06-mobile-screens.md |
| M-SHARE-02 | Link made | `d/mobile.html?only=d-m-link` | 06-mobile-screens.md |
| M-SHARE-03 | Links and people | (added in 06) | 06-mobile-screens.md |
| M-STATUS-01 | Status home | `d/index.html?only=d-m-status` | 06-mobile-screens.md |
| M-STATUS-02 | Home situations: all clear, offline with changes waiting | `b/mobile.html?only=b-m-home-clear`, `b/mobile.html?only=b-m-home-offline` | 06-mobile-screens.md |
| M-STATUS-03 | Plan ahead | `d/mobile.html?only=d-m-plan` | 06-mobile-screens.md |
| M-STATUS-04 | Suggested visit | `d/mobile.html?only=d-m-suggest` | 06-mobile-screens.md |
| M-STATUS-05 | Item detail | `d/mobile.html?only=d-m-item` | 06-mobile-screens.md |
| M-STATUS-06 | Mark done | `b/mobile.html?only=b-m-mark-done` | 06-mobile-screens.md |
| M-STATUS-07 | VOR check log | `b/mobile.html?only=b-m-vor` | 06-mobile-screens.md |
| M-STATUS-08 | All items (due list) | (added in 06) | 06-mobile-screens.md |
| M-SWITCH-01 | Aircraft switcher | (added in 06) | 06-mobile-screens.md |
| M-SYS-01 | Waiting to upload, conflict | `b/mobile.html?only=b-m-pending` | 06-mobile-screens.md |
| M-SYS-02 | Settings | `b/mobile.html?only=b-m-settings` | 06-mobile-screens.md |
| M-SYS-03 | Lock screen, widget, notifications | `d/mobile.html?only=d-m-lock`, `b/mobile.html?only=b-m-lock` | 06-mobile-screens.md |
| M-SYS-04 | Permissions | (added in 06) | 06-mobile-screens.md |
| M-SYS-05 | Notification settings | (added in 06) | 06-mobile-screens.md |
| M-SYS-06 | Widget configuration | (added in 06) | 06-mobile-screens.md |
| M-SYS-07 | Android predictive back | (added in 06) | 06-mobile-screens.md |
| M-SYS-08 | Keyboard and pointer | (added in 06) | 06-mobile-screens.md |
| M-SYS-09 | Watch and Wear (optional) | (added in 06) | 06-mobile-screens.md |
| T-BOOKS-01 | Map with pages | `d/mobile.html?only=d-t-map` | 06-mobile-screens.md |
| T-REVIEW-01 | Review three panes | `b/mobile.html?only=b-t-review` | 06-mobile-screens.md |
| T-STATUS-01 | Status two panes | `d/mobile.html?only=d-t-status` | 06-mobile-screens.md |
| T-STATUS-02 | Plan ahead | `d/mobile.html?only=d-t-plan` | 06-mobile-screens.md |

Kept from today with new tokens only (no new spec): developer portal, OAuth consent, admin, marketing site.
