# Onboarding emails

Migration `0065_onboarding_emails.sql` must be applied to test and production before deploying the web code. It creates the campaign launch timestamp, unsubscribe preference/token, and send log. The launch timestamp separates existing users (one catch-up email) from new signups (the normal sequence). Admin accounts and demo/test addresses are excluded. The production sender also skips any addresses in the comma-separated `ONBOARDING_EXCLUDE_EMAILS` runtime variable.

The existing daily cron sends at most 50 setup emails per run. It waits 24 hours after signup with no owned aircraft; seven days after the first owned aircraft with no pages or entries; 24 hours after a page was uploaded but not extracted; or 24 hours after extraction with entries awaiting review. The first confirmed entry gets a one-time success note. A user receives no more than three nudge emails, at least three days apart. Existing users get one catch-up email for their current step and do not enter the new-user sequence.

## Release check

1. Apply the migration to test, then production. The campaign starts disabled so it cannot send before the recipient audit.
2. Deploy the web build. Request `GET /api/cron/onboarding` with the existing `CRON_SECRET` bearer token. Inspect the returned recipient list and stage. Check that no owner, admin, demo, or test accounts are present.
3. Set `onboarding_email_campaign.enabled = true` in production after the list is checked. Run the **Send onboarding emails** GitHub Actions workflow to send a batch using the existing `CRON_SECRET` repository secret. Repeat until no catch-up candidates remain. The normal daily job then handles new accounts.
4. Check `onboarding_email_log` for `sent_at` and Resend for delivery. A claimed row with null `sent_at` means the send result was uncertain; investigate it before clearing the row.
5. Open a message's unsubscribe link. GET must show a confirmation page without changing the preference; POST must set `profile.onboarding_opt_out = true`. Verify that maintenance reminder settings are unchanged.

The public `POST /api/onboarding/unsubscribe` also supports email clients' one-click unsubscribe. The email includes both a visible link and the `List-Unsubscribe` headers. Replies go to `mytaillog@iamit.org`; the footer uses the operator's supplied Houston address.
