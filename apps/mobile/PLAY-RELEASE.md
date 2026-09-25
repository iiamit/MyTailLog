# Android Play release checklist

Package: `com.mytaillog.app`. The local release build uses version code 3. Play
already has version codes 1 and 2, with 2 completed on the internal track.
The English listing has a feature graphic and four phone screenshots. Check
`npm run play:check` for the current state.

## Before inviting testers

1. Apply `supabase/migrations/0060_android_device_tokens.sql` to production and
   deploy the matching web push API. Confirm its Firebase identity can send FCM
   messages to project `mytaillog-22ee6`.
2. Build with `npm run android:bundle`, or use `npm run play:draft` to build and
   upload a new signed AAB as an internal draft. On this small host, set
   `MYTAILLOG_ANDROID_SKIP_LINT=1` if Gradle release lint runs out of memory.
   Run the full lint build on a host with more RAM before public release.
3. In Play Console, review and release the draft to the internal test track,
   add tester emails or a Google Group, and install using its opt-in link.
4. Complete the Console forms: App access (provide review login instructions),
   Data safety, content rating, target audience, ads declaration, and the
   privacy policy URL. Review the Console's current required declarations.
   Use `https://mytaillog.com/privacy` and
   `https://mytaillog.com/account-deletion` only after the web deployment makes
   those pages public. The app links to the deletion page from Account.
5. Check Data safety answers against actual production behavior. The app uses
   email authentication, stores user-provided aircraft, maintenance records,
   scans and documents, sends optional push notifications, and sends selected
   scans or text to AI services for extraction or answers. The Android app
   registers an FCM device token when notifications are allowed. Check optional
   connected services, deletion handling, encryption in transit, and any data
   sharing against the production privacy policy before submitting the form.

## Device acceptance

Use a recent Android phone, a lower-memory phone, and a tablet, with Android 13
and Android 16 represented. The scanner needs a real camera and Google Play
Services. This host has no device or emulator, so these checks require a tester.

- Install from Play internal testing. Sign in, add/sync an aircraft, close and
  reopen the app, then verify records and account isolation after sign-out.
- Scan a full 24-page session; adjust a crop, review pages, and verify upload.
- Download and open PDFs and scans, go offline, make an edit and add a squawk,
  force-close, reopen, reconnect, and resolve a conflict against a web edit.
- Open every sheet and viewer; verify system Back closes the top surface before
  changing screens. Check keyboard clearance, status bar, dark mode, talkback
  labels, and compact/tablet layouts in both orientations.
- With the app closed, send a test push. Confirm delivery and correct navigation;
  sign out and verify the device no longer receives account reminders.
- Run the web/iOS regression checks for shared sync and push paths.

Record the results, fix any failures, then promote the tested bundle through a
closed test or production in Play Console. A successful AAB upload alone is not
a completed Play release.
