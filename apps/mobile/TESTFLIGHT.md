# Shipping MyTailLog to TestFlight

**Already set up and just shipping a new build?** Jump to
[Updating an existing build](#updating-an-existing-build) — it's four steps.
Everything before it is one-time setup you've already done.

**v1**: sync + browse aircraft/entries/scans offline, download-all, **and offline capture**
(camera → queue → upload). Because capture uses the camera, Info.plist needs a
camera-usage string (step 2) — without it the app crashes the first time you tap
*Take photo*.

The in-repo pieces are done (bundle id, icon source, config). The rest is Xcode +
App Store Connect, which only you can do (signing, archive, upload).

## 0. Prerequisites
- Enrolled in the **Apple Developer Program** ($99/yr).
- Xcode installed and signed in with your Apple ID (Xcode → Settings → Accounts).
- The app builds locally: `cd apps/mobile && npm install && npm run ios`.

## 1. App icon (one command)
```bash
cd apps/mobile
npm install                       # pulls @capacitor/assets
npx cap add ios                   # if you haven't already
npm run icons                     # generates the AppIcon set from assets/logo.svg
npx cap sync ios
```
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
- The hangar shows *"N changes waiting to upload"*.

Then turn Airplane Mode off and **Sync**. The banner should clear, and everything
should appear on the web app — the VOR check as both a reset counter **and** a log
entry containing the place and bearing error. Sync a second time and confirm
nothing duplicates.

**Capture** offline → back online → **Upload** → it extracts server-side and syncs
back into the logbook.

## Updating an existing build

Once steps 0–5 are done, shipping a new version is just this:

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
