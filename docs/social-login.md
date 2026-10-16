# Google and Apple sign-in rollout

The website offers Google, Apple, magic links, and email/password. Android offers
Google, magic links, and email/password. iOS offers Apple, magic links, and
email/password. Existing users should sign in with their original method first
and choose **Connect** in Profile (web) or Account (mobile). That attaches the
provider identity to the same Supabase user ID, so aircraft and records stay put.

## Provider setup (test first, then production)

1. In each Supabase project, Authentication → URL Configuration: retain the
   existing Site URL and add `https://mytaillog.com/auth/callback**` (use the
   test site's actual origin in test) and `com.mytaillog.app://auth/callback` to
   Additional Redirect URLs. Do not allow arbitrary domains. The mobile return
   URL is handled by the app; the provider's callback URL is **Supabase's**
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase Authentication settings, enable **Manual identity linking**.
   Automatic linking by verified, matching email stays enabled. Manual linking
   is needed when Apple uses Hide My Email or a Google account uses a different
   address. This is Auth configuration, not a SQL migration.
3. In Google Auth Platform, configure the consent screen and create a **Web
   application** OAuth client with the Supabase callback URL as an Authorized
   redirect URI. Put its client ID and secret in Authentication → Providers →
   Google for that Supabase project. Publish the consent screen when ready;
   while it is in Testing, only listed test users can sign in. Request only the
   standard identity scopes. The Google Drive backup OAuth client is separate.
4. In Apple Developer, enable Sign in with Apple for `com.mytaillog.app`, create
   a Services ID for the web OAuth flow, associate the site domain, and add
   each Supabase project callback URL as a return URL. Create a Sign in with
   Apple key. In each Supabase project, Authentication → Providers → Apple, set
   the Services ID (first client ID), Team ID, Key ID, and private key/secret as
   requested by the dashboard. Keep the `.p8` key out of Git. Renew the web
   OAuth client secret before its six-month expiry. Register the application's
   outbound email domain with Apple's Private Email Relay so users choosing
   Hide My Email can receive mail.

Provider credentials live in Supabase Auth, not in `apphosting.yaml`, the
mobile `.env`, or a database migration. Both Supabase projects need separate
provider configuration and redirect lists. Do not enable a provider in
production until its callback and existing-account linking pass in test.

## Native build setup

- Android: the tracked `AndroidManifest.xml` handles
  `com.mytaillog.app://auth/callback`. A rebuilt app is required.
- iOS: `ios/` is generated and ignored by Git. `npm run cap:sync` and the
  TestFlight upload script run `scripts/configure-ios-auth.sh`, which registers
  the same URL scheme in the generated `Info.plist`. Run `npm run cap:sync`
  before a manual Xcode archive too. The browser-based flow does not require
  a native Sign in with Apple entitlement.
- The mobile client uses authorization-code PKCE. Its verifier and session use
  the existing secure storage. No social-provider access token is stored for
  another purpose.
- The login buttons use official provider artwork saved under
  `apps/web/public/brand/`: Apple's generated Continue button from
  `https://appleid.cdn-apple.com/appleid/button` and Google's multicolor G from
  `https://developers.google.com/static/identity/images/g-logo.png`.

## Release checks

On test, verify new sign-up, return to the app after backgrounding or cold
launch, cancelled sign-in, wrong provider credentials, email confirmation,
magic link, and sign-out/sign-in. For an existing account, record the Supabase
user ID and aircraft IDs before linking, then confirm they are unchanged after
linking and after social sign-in on another device. Include Apple's Hide My
Email case. Confirm the web profile and mobile Account menu report the linked
provider. Finally verify that an existing password and magic link still work.

The web callback intentionally accepts only relative in-app `next` paths.
Keep that check if the callback changes.
