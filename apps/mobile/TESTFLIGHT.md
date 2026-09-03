# Shipping MyTailLog to TestFlight

**Already set up and just shipping a new build?** Use the
[one-command upload](#one-command-upload), or fall back to
[Updating an existing build](#updating-an-existing-build).
Everything before it is one-time setup you've already done.

**v1**: sync + browse aircraft/entries/scans offline, download-all, **and offline capture**
(camera → queue → upload). Because capture uses the camera, Info.plist needs a
camera-usage string (step 2) — without it the app crashes the first time you tap
*Take photo*.

The in-repo pieces are done (bundle id, icon source, config). Initial signing is
still completed once in Xcode; routine builds can then be archived and uploaded
from the terminal.

## One-command upload

Create an App Store Connect API key under **Users and Access → Integrations**
with permission to upload builds. Download its `.p8` file when Apple offers it;
the file cannot be downloaded again.

Set these in your shell profile (never commit the key):

```bash
export APP_STORE_CONNECT_KEY_ID="ABC123DEF4"
export APP_STORE_CONNECT_ISSUER_ID="00000000-0000-0000-0000-000000000000"
export APP_STORE_CONNECT_KEY_PATH="$HOME/private_keys/AuthKey_ABC123DEF4.p8"
```

Then ship the version already configured in Xcode:

```bash
cd apps/mobile
npm run testflight
```

Or set a new marketing version for this upload:

```bash
npm run testflight -- 1.4
```

The script builds the web assets, syncs Capacitor, assigns a UTC timestamp as a
unique TestFlight build number, archives with Xcode, exports the IPA, and uploads
it. Override the generated number only when necessary with
`BUILD_NUMBER=123 npm run testflight -- 1.4`.

The first run may require opening the workspace once and selecting the signing
team. The API key handles App Store Connect authentication; the Mac still needs
the Apple distribution signing identity installed by Xcode.

## 0. Prerequisites
- Enrolled in the **Apple Developer Program** ($99/yr).
- Xcode installed and signed in with your Apple ID (Xcode → Settings → Accounts).
- The app builds locally: `cd apps/mobile && npm install && npm run ios`.

## 1. App icon (one command)
```bash
cd apps/mobile
npm install
npx cap add ios                   # if you haven't already
npx --yes @capacitor/assets@3.0.5 generate --ios --assetPath assets
npx cap sync ios
```
(The generated icon set is committed. Run the generator only when `assets/logo.svg`
changes; it is intentionally not installed with every mobile build.)
(If `capacitor-assets` rejects the SVG on your machine, export `assets/logo.svg` to a
1024×1024 `assets/logo.png` and re-run — same command.)

## 2. Xcode config — open `ios/App/App.xcworkspace`
- **Signing & Capabilities** → check *Automatically manage signing* → select your **Team**.
  Bundle Identifier is already **`com.mytaillog.app`**.
- **General** → Display Name **MyTailLog**, Version **1.0.0**, Build **1**
  (bump Build for every upload).
- **Info** (Info.plist) → add these rows:
  - **`ITSAppUsesNonExemptEncryption`** = **NO** (standard HTTPS/OS crypto only —
    skips the export-compliance prompt on every upload).
  - **Camera/photo usage strings — all THREE required** (the `@capacitor/camera`
    plugin throws at runtime if any is missing, even for camera-only capture):
    - **`NSCameraUsageDescription`** — *"MyTailLog uses the camera to photograph your logbook pages."*
    - **`NSPhotoLibraryAddUsageDescription`** — *"MyTailLog can save captured logbook pages to your photos."*
    - **`NSPhotoLibraryUsageDescription`** — *"MyTailLog accesses your photos to add existing logbook scans."*
    After adding them, **clean build** (Xcode → Product → Clean Build Folder) so the
    running binary picks them up — App Store Connect validates the *uploaded* plist,
    not the build already on your device/simulator.

## 3. App Store Connect — https://appstoreconnect.apple.com
- **Apps → +→ New App**: iOS · Name **MyTailLog** · Primary language · Bundle ID
  **com.mytaillog.app** (register it first under *Certificates, IDs & Profiles →
  Identifiers* if it's not in the dropdown) · SKU e.g. `mytaillog-ios`.

## 4. Archive & upload
- In Xcode, set the run destination to **Any iOS Device (arm64)** (not a simulator).
- **Product → Archive** → the Organizer opens → **Distribute App → App Store Connect →
  Upload** → accept defaults → Upload.
- (Alternatively, `fastlane pilot` — but the Xcode path is fine for the first build.)

## 5. TestFlight
- App Store Connect → **MyTailLog → TestFlight**. The build shows as *Processing*
  (~10–15 min), then *Ready to Test*.
- **Internal testers** (you + up to 100 team members): add them → they get an email →
  install the **TestFlight** app → install MyTailLog. No Beta App Review needed.
- **External testers** (anyone by email/public link) require a one-time **Beta App
  Review** (usually a day) and a filled-in "Test Details" + privacy policy URL.

## 6. Smoke test on a real device

**Offline reads.** Sign in → **Sync** → **Download all scans for offline** → enable
**Airplane Mode** → browse hangar → entries → an entry's scan → **Scans** grid →
prev/next. Then **Status** (current tach/hobbs, items worst-first) and **Documents**
(the four AROW slots). All should work with no signal — that's the whole point of
those two screens.

**Scanning** (the reason for this build): tap **Scan pages**. You should get
Apple's document scanner — the Notes one — with automatic edge detection and the
black-and-white document look. Check that you can drag the crop handles before
keeping a page, and that shooting several pages in one session queues them all.

**PDFs**, still offline: open a PDF document (registration and airworthiness
certificates usually are). It should render in-app, page by page, with prev/next
on a multi-page file, and tap-to-zoom. A PDF you've never downloaded says so
rather than hanging — run **Download all scans for offline** first.

**Offline writes**, still in Airplane Mode:
- **Record** → the meters are prefilled; type a *lower* tach and check it warns you,
  then correct it and queue it.
- **Record** → queue an oil addition.
- **Squawks → + New** → queue one; it shows under *Waiting to upload*.
- **Status → Mark done** on the VOR check → it should demand place, bearing error
  and signature before it will save.
- Scan a page; the hangar count includes that page as well as the structured writes.
- The hangar shows *"N changes waiting to upload"* and the Pending screen lists
  both the actions and the scanned-page count.

Then turn Airplane Mode off. Sync should start automatically, the banner should
clear, and everything should appear on the web app — the VOR check as both a
reset counter **and** a log entry containing the place and bearing error. Tap
**Sync** once more and confirm nothing duplicates.

Finally, while already online, record another meter change and scan another page.
Each should sync without entering the pending list or requiring the Sync button.

**The platform pass.** Four more, all of which fail silently if they're wrong:

- **Session in the Keychain.** Sign in, force-quit the app (swipe up), turn on
  Airplane Mode, relaunch. It should open straight into the hangar — not the
  sign-in screen. Upgrading over an older build must not sign you out either.
- **Light appearance.** Account menu → *Appearance* → **Light**, then take the
  phone outside. Nothing should be grey-on-grey, the status-bar clock must stay
  readable, and *GROUNDED* / *DUE SOON* / *AIRWORTHY* must still be three
  obviously different colours. Switch to **Match my phone** and flip iOS
  Settings → Display & Brightness; the app follows without a relaunch.
- **A push arrives.** Accept the prompt after signing in, then trigger the daily
  cron with something due (section 7e). If the token registers but nothing
  arrives, it is nearly always `APNS_ENV`.
- **Add my aircraft.** On a fresh account, first run → *Add my aircraft* → type
  a real tail → the FAA's make/model/serial come back → confirm → the aircraft
  appears in the hangar.

## 6b. Signing: why the export is manual

`npm run testflight` exports with **manual** signing against a named profile:

    PROFILE_NAME="iOS Team Store Provisioning Profile: com.mytaillog.app"

`signingStyle: automatic` asks Apple to mint that profile at export time ("cloud
signing"), and the App Store Connect API key must hold **App Manager** or
**Admin** to be allowed to. A key with the Developer role fails with:

    error: exportArchive Cloud signing permission error
    error: exportArchive Provisioning profile "..." doesn't include the Push
           Notifications capability.

Those last two lines are misleading — the capability *is* on the App ID; the
profile simply was never created. Read the first line, not the loudest one.

Naming an existing profile removes the dependency entirely. Xcode installs one
the first time you distribute from the **Organizer**, so if the script ever says
it cannot find the profile, that is the fix: archive once from Xcode, then the
CLI works again. Override `PROFILE_NAME` if the team renames it.

The script preflights the profile before building: it must exist locally and
carry `aps-environment = production`, or it exits with the reason. A TestFlight
build signed for the development APNs host registers no device tokens and fails
silently — that is worth catching in two seconds rather than after an upload.

**Version caveat.** The script passes `MARKETING_VERSION` and
`CURRENT_PROJECT_VERSION` as `xcodebuild` flags, which do **not** persist to
`project.pbxproj`. An archive made by hand in Xcode therefore ships whatever the
project file says — set it there first if you are not using the script.

## 7. Push notifications — the APNs key (one time)

The app registers its device token after sign-in; the daily cron sends the same
"coming due" reminder the email carries. Nothing arrives until this is done, and
nothing breaks either — an unconfigured sender logs one line and skips.

**a. Turn the capability on.** Xcode → the `App` target → *Signing &
Capabilities* → **+ Capability** → **Push Notifications**. That writes
`aps-environment` into the entitlements. Xcode sets it to `development` for a
run from Xcode and `production` for an archive — which is why the same phone
needs a different `APNS_ENV` depending on how the build got there.

**b. Register the App ID for push.** developer.apple.com → *Certificates, IDs &
Profiles → Identifiers → com.mytaillog.app* → tick **Push Notifications** →
Save. (Automatic signing regenerates the profile on the next build.)

**c. Create the APNs key.** *Keys → +* → name it `MyTailLog APNs` → tick **Apple
Push Notifications service (APNs)** → Continue → Register → **Download** the
`AuthKey_XXXXXXXXXX.p8`. **It can only be downloaded once.** Note the 10-character
**Key ID** on that page and your **Team ID** (top right of the developer portal).

**d. Put it in Secret Manager.** One key serves every app on the team, and it
never expires.

```bash
firebase apphosting:secrets:set APNS_KEY_ID      # the 10-character key id
firebase apphosting:secrets:set APNS_TEAM_ID     # the 10-character team id
firebase apphosting:secrets:set APNS_BUNDLE_ID   # com.mytaillog.app
firebase apphosting:secrets:set APNS_ENV         # production  (see below)
firebase apphosting:secrets:set APNS_KEY < ~/private_keys/AuthKey_XXXXXXXXXX.p8
```

The secret **ID must match `apps/web/apphosting.yaml` character for character** —
PR #131 was a deploy that failed for exactly that reason.

`APNS_ENV` is `production` for anything installed through TestFlight or the App
Store, and `sandbox` **only** for a build run onto a cable-attached device from
Xcode. A sandbox token on the production host answers `400 BadDeviceToken`, the
cron treats that as a dead device and deletes the row — so if you are testing
from Xcode, set it to `sandbox` and set it back before shipping.

**e. Check it.** Sign in on the device, accept the prompt, then in Supabase:
`select platform, created_at from device_token;` should show a row. Trigger the
cron (`POST /api/cron/daily` with the `CRON_SECRET` bearer) with something
genuinely due and the alert should arrive within seconds.

## 8. App Store submission — the answers

### Privacy labels ("App Privacy" in App Store Connect)

Answer **Yes** to "Does this app collect data?" and declare exactly these. All of
them are **linked to the user's identity** and **none** are used for tracking, so
answer **No** to the tracking question and leave the *Third-Party Advertising* /
*Analytics* sections empty.

| Data type | Purpose | Linked | Tracking |
| --- | --- | --- | --- |
| **Contact Info → Email Address** | App Functionality (the account, and the reminder emails) | Yes | No |
| **User Content → Photos or Videos** | App Functionality (scanned logbook pages) | Yes | No |
| **User Content → Other User Content** | App Functionality (log entries, maintenance records, squawks) | Yes | No |
| **Identifiers → User ID** | App Functionality (the account id the records hang off) | Yes | No |
| **Diagnostics → Crash Data** | *only if* a crash reporter is ever added — today: **do not declare** | — | — |

Not collected, and worth being able to say so: no location (the aircraft's home
base is typed, not sensed), no contacts, no health, no purchases, no advertising
data, no identifiers beyond the account. The APNs device token is not a declared
data type — it is a delivery address, not collected data — but the notifications
it carries are why *Email Address* is declared under App Functionality.

### Account deletion (Guideline 5.1.1(v)) — REQUIRED, and not finished

Any app with account creation must offer account **deletion** initiated from
inside the app. The account menu has **Delete my account**, which opens
`mytaillog.com/profile#delete-account` in Safari.

> **That page does not exist yet.** A link to a page without a working deletion
> flow is a rejection, not a compliance answer. The web flow — confirm, then
> delete the auth user and every record it cascades to — must ship before the
> first App Store submission. It is not needed for TestFlight.

Apple accepts a web link only where it leads *directly* to the deletion, so the
anchor must land on the control itself, not on the top of a settings page.

### Other answers Apple asks for

- **Export compliance**: `ITSAppUsesNonExemptEncryption = NO` in Info.plist
  (see `ios-config.md`) answers this automatically on every upload.
- **Sign in with Apple**: not required — the app has no third-party social login,
  only email/password. Adding Google sign-in later would make it mandatory.
- **Content rights**: the app displays the owner's own documents; nothing
  licensed. FAA registry and AD data are US government works.
- **Demo account for review**: give the reviewer a real signed-in account with a
  populated aircraft. "Look around with a demo aircraft" on first run is not
  enough — a reviewer will test sync and capture.
- **Age rating**: 4+.

### Widget and Siri Shortcut

Both need native Swift targets and are deliberately **not** in this build. What
each would take is written down in `ios-config.md`.

## Updating an existing build

If the command-line upload is unavailable, the manual fallback is:

```bash
git pull                       # get the changes you're shipping
cd apps/mobile
npm install                    # only if package.json changed — it DID for the PDF viewer
npm run ios                    # vite build && cap sync ios && cap open ios
```

> **⚠️ The Capacitor 6 → 8 upgrade is a bigger step than a normal build.** Do this
> once, instead of the above:
>
> ```bash
> cd apps/mobile
> rm -rf node_modules package-lock.json && npm install
> rm -rf ios/App/Pods ios/App/Podfile.lock
> npx cap sync ios              # regenerates the pods for Capacitor 8
> npm run ios
> ```
>
> **You will hit this**, because `ios/` is git-ignored and still carries the
> Capacitor 6 settings:
>
> ```
> [!] CocoaPods could not find compatible versions for pod "Capacitor":
>     … they required a higher minimum deployment target.
> ```
>
> Every Capacitor 8 pod needs **iOS 15.0**; the generated project was on 13.0.
> Fix both places, then re-sync:
>
> ```bash
> # 1. ios/App/Podfile
> sed -i '' "s/platform :ios, '13.0'/platform :ios, '15.0'/" ios/App/Podfile
>
> # 2. the Xcode project (there may be several build configs)
> sed -i '' "s/IPHONEOS_DEPLOYMENT_TARGET = 13.0/IPHONEOS_DEPLOYMENT_TARGET = 15.0/g" \
>   ios/App/App.xcodeproj/project.pbxproj
>
> rm -rf ios/App/Pods ios/App/Podfile.lock
> npx cap sync ios
> ```
>
> Check with `grep -o "IPHONEOS_DEPLOYMENT_TARGET = [0-9.]*" ios/App/App.xcodeproj/project.pbxproj | sort -u`
> — nothing below 15.0 should remain. **Anyone who re-runs `npx cap add ios` has
> to redo this**, since the regenerated project defaults low again.
>
> In Xcode: **Product → Clean Build Folder** before archiving.
>
> Raising the floor to iOS 15 drops support for iOS 13–14 devices — an iPhone 6s
> or SE (1st gen) that can't go past 15 is fine, but anything stuck on 14 or below
> can no longer install the app.
>
> **Test the on-device database before you ship it.** `@capacitor-community/sqlite`
> also went 6 → 8, and existing installs already hold a synced mirror. Install the
> new build **over** an existing one (don't delete the app first) and confirm your
> aircraft, entries and any queued captures are still there. If the mirror is
> empty, that's a migration problem, not a sync problem — say so rather than
> re-syncing over it.

Then in Xcode:

1. **General → Build** — bump it (`2`, `3`, …). TestFlight rejects a duplicate
   build number, and this is the single most common reason an upload bounces.
   Bump **Version** too (e.g. `1.1.0`) when the change is user-visible.
2. Run destination → **Any iOS Device (arm64)**. Archive is greyed out on a simulator.
3. **Product → Archive** → Organizer opens → **Distribute App → App Store Connect →
   Upload**.
4. App Store Connect → **TestFlight**. *Processing* takes ~10–15 min, then internal
   testers can install it immediately — **no Beta App Review** for internal testers.
   External testers need a review only when "what to test" changes materially.

**When you need more than that:**
- **New Capacitor plugin** → re-run `npx cap sync ios`, and add any Info.plist usage
  string the plugin needs (see step 2). A missing usage string is a runtime crash,
  not a build error, so it only bites on a real device.
- **New native permission** → new Info.plist row, and clean build (Product → Clean
  Build Folder) so the uploaded plist actually contains it.
- **Pure JS/TS changes** (new screens, shared web code, API calls) → nothing native
  changes; `npm run ios` + bump + archive is the whole story.

## Notes
- `ios/` is git-ignored in this repo (regenerated by `npx cap add ios`). If you want the
  native project version-controlled (signing config, icons), remove `ios` from
  `apps/mobile/.gitignore` and commit it.
- Bump the **Build** number for each new upload; TestFlight rejects duplicate builds.
- The app bundles code from `apps/web/src` (the shared compliance math — see the
  README). That's resolved by Vite at **build** time, so `npm run ios` from a clean
  `git pull` is enough; there's no runtime dependency on the web app being deployed.
  But it does mean **`vite build` must run from the monorepo checkout** — building
  `apps/mobile` in isolation, detached from `apps/web`, will fail to resolve `@/…`.
