# Application test gates

The PR checks exercise both web designs. Existing Playwright specs keep the old-design flows; `v2-*.spec.ts` use the same test Supabase project and opt into the new design through `/api/ui`. New route tests check rendering, Add-menu tests check the opened editor, and focused journeys check saved data, review, permissions, and source pages. CI runs these with `UI_V2_DEFAULT=off`, matching the current production default.

Android PR CI runs Compose/Robolectric and shared-core Android host tests. Apple PR CI runs shared-core iOS simulator tests, Swift unit tests, and the iOS simulator UI tests. Its XcodeGen overlay (`apps/ios/project-ci.yml`) links only the Debug simulator framework. Archives continue using `project.yml` and the Release XCFramework. These checks require no physical device or release credentials.

Native jobs run when their platform changes, or when shared code, fixtures, database migrations, API routes, backend libraries, scripts or workflows change. Web UI and documentation changes still run the required web, browser and security checks. Change detection examines the entire PR diff (including deletions and both paths of renames); a detection failure blocks `check`. Scheduled weekly, manual and published-release CI runs always include both native platforms. Non-PR native runs additionally build the Release XCFramework for device/simulator verification.

CI, E2E and Semgrep cancel superseded commits on the same PR. Checks on merged commits are retained. Kotlin/Native caches are scoped to the runner architecture and Xcode toolchain. iOS UI journeys dismiss their forms and verify the start screen between paths; owner/viewer and signed-out launches remain isolated.

Before a mobile release, run the **Mobile test-backend checks** workflow manually. Add repository secret `MTL_QA_USER_JSON` containing a JSON object with `email` and `password` for the test-backend QA account that owns N734QA. Both jobs fail if the secret is absent. Android exercises capture, records, and sharing against the test backend; iOS signs in, pulls its aircraft, and checks that the offline mirror survives a restart. The debug apps point only to the test Supabase project and `mfb-test.mytaillog.com`.

For a local Android run, set `MTL_QA_USER` to a private JSON file with that same account, set `MTL_QA_REQUIRED=1`, and run `./gradlew :app:testDebugUnitTest --tests 'com.mytaillog.app.Live*Test'` from `apps/android`. The live tests skip during ordinary PR CI; the release workflow makes skipping a failure.
