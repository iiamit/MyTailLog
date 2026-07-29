# Security policy

MyTailLog holds aircraft maintenance records — tail numbers, serial numbers,
owner names, home base — which are treated as **sensitive personal data**. If you
find a way to reach data that isn't yours, or to act as someone else, I want to
know about it.

Thank you for taking the time to look.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use either channel:

1. **[GitHub private vulnerability reporting](https://github.com/iiamit/MyTailLog/security/advisories/new)**
   — preferred. It's private, structured, and becomes a draft advisory we can fix
   and publish from.
2. **Email: mytaillog@iamit.org** — if you'd rather not use GitHub, or the report
   doesn't fit an advisory form.

Please include enough for me to reproduce it:

- what you found, and what an attacker could actually do with it,
- the steps, request/response pairs, or a short proof-of-concept,
- the URL or file/function involved, and roughly when you tested,
- anything you think makes it more or less severe than it looks.

A clear report about a small bug is more useful than a vague one about a big
bug. If you're unsure whether something counts, report it anyway.

## What to expect

This is a small, open-source project maintained by one person, so I'm not going
to promise a response time I can't keep. What I will do:

- **Acknowledge your report** as soon as I reasonably can — usually within a few
  days.
- **Tell you whether I've reproduced it**, and what I think the severity is.
- **Keep you updated** while it's being fixed, and let you know when it ships.
- **Credit you** in the advisory and changelog, unless you'd rather stay
  anonymous.

Serious issues — anything crossing the tenant boundary, exposing credentials, or
allowing account takeover — jump the queue ahead of everything else I'm working
on.

There is **no paid bug bounty.** This is a free tool with no revenue behind it.
What I can offer is a fast fix, public credit, and my genuine thanks.

**Disclosure:** please give me a reasonable chance to ship a fix before
publishing. I'm not going to hold you to an arbitrary embargo — if I've gone
quiet or I'm not taking it seriously, you're free to disclose. I'd just ask that
you tell me first.

## Scope

**In scope**

- **https://mytaillog.com** — the hosted application, including the OAuth 2.1
  authorization server and the `/api/v1` resource server.
- **This repository** — application code, SQL migrations and row-level-security
  policies, CI workflows, and anything that would let a malicious dependency or
  workflow reach production.

**Out of scope**

- **The underlying platforms** — Supabase, Google Cloud / Firebase App Hosting,
  and Anthropic. Report those to the respective vendor. A *misconfiguration on
  our side* of one of those platforms is very much in scope.
- **Vulnerabilities in third-party dependencies** with no demonstrated impact
  here — report upstream. If you can show it's exploitable *through MyTailLog*,
  that's in scope.
- **Self-hosted deployments** you've configured yourself (MIT-licensed; your
  environment, keys, and Supabase project are yours to secure).
- Volumetric denial of service, spam, or brute-forcing the live service.
- Social engineering, phishing, or physical attacks against me or any user.
- Missing hardening with no demonstrated impact (a header, a cookie flag, a
  version disclosure, an SPF/DMARC finding) — I'll read it, but it's likely to be
  triaged as low or informational.
- Reports produced solely by an automated scanner, with no analysis of whether
  the finding is actually reachable.

## Testing guidelines

The app is **multi-tenant**, so the rules here matter more than usual:

- **Test against your own account and your own aircraft.** Signup is free — make
  as many accounts as you need, and share aircraft between them to probe the
  sharing and OAuth consent boundaries.
- **Never access, modify, or retain another user's data.** If you find a way in,
  that *is* the finding — stop there, capture only the minimum needed to prove
  it, and report it. Don't go looking through what you can reach.
- If you do incidentally see someone else's data, tell me in the report and
  delete your copy.
- Don't run destructive tests, load/stress tests, or automated scanners against
  the live service.
- Use obviously-fake data for anything you create.

**Safe harbor:** if you follow this policy and act in good faith, I will treat
your research as authorized, won't pursue legal action, and will work with you.
If you're not sure whether something is allowed, ask first — mytaillog@iamit.org.

## Supported versions

MyTailLog is a **continuously deployed hosted service**, not a released library.
There are no maintained release branches:

| Version | Supported |
| --- | --- |
| `main` (what's live at mytaillog.com) | ✅ |
| Any older commit, tag, fork, or self-hosted copy | ❌ |

Fixes land on `main` and deploy to production. Calendar-based versions
(`APP_VERSION`, shown in the app header) mark notable changes in
[`CHANGELOG.md`](CHANGELOG.md) — they are not separately supported.

## How the app is defended

Useful context if you're deciding where to look:

- **Row-level security is the enforcement boundary.** Access to every aircraft
  and every child record is decided by Postgres RLS policies, not by application
  code. An RLS-isolation regression suite runs in CI on every pull request.
- **The OAuth resource server authorizes explicitly.** RLS does *not* apply to
  OAuth access tokens, so `/api/v1` checks the caller's per-aircraft or
  account-wide grant on every request.
- **Third-party secrets are encrypted at rest** (AES-256-GCM) and decrypted only
  server-side, never sent to the browser. Ciphertext lives in a Postgres schema
  that isn't exposed over the REST API and is reachable only through
  `SECURITY DEFINER` functions granted to the server role.
- **Elevated, RLS-bypassing paths are deliberately few** — the daily cron (behind
  a shared-secret gate) and the AI usage ledger — and are scoped to their purpose.
- **Defense in depth on responses:** Content-Security-Policy, HSTS,
  X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy;
  redirect origins are pinned to a configured value rather than a request header.
- **Supply chain:** Semgrep and Dependabot run in CI, and every GitHub Action is
  pinned to a full commit SHA.

None of that is a claim of perfection — it's a map. If you've found a hole in it,
please tell me.
