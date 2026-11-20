# Application test gates

The PR checks exercise both web designs. Existing Playwright specs keep the old-design flows; `v2-*.spec.ts` use the same test Supabase project and opt into the new design through `/api/ui`. New route tests check rendering, Add-menu tests check the opened editor, and focused journeys check saved data, review, permissions, and source pages. CI runs these with `UI_V2_DEFAULT=off`, matching the current production default.

Android PR CI runs Compose/Robolectric and shared-core tests. Apple PR CI runs unit tests plus the iOS simulator Add and launch UI tests. These checks require no physical device or release credentials.

Before a mobile release, run the **Mobile test-backend checks** workflow manually. Add repository secret `MTL_QA_USER_JSON` containing a JSON object with `email` and `password` for the test-backend QA account that owns N734QA. Both jobs fail if the secret is absent. Android exercises capture, records, and sharing against the test backend; iOS signs in, pulls its aircraft, and checks that the offline mirror survives a restart. The debug apps point only to the test Supabase project and `mfb-test.mytaillog.com`.

For a local Android run, set `MTL_QA_USER` to a private JSON file with that same account, set `MTL_QA_REQUIRED=1`, and run `./gradlew :app:testDebugUnitTest --tests 'com.mytaillog.app.Live*Test'` from `apps/android`. The live tests skip during ordinary PR CI; the release workflow makes skipping a failure.
