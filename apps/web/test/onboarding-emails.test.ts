import { test } from "node:test";
import assert from "node:assert/strict";
import { excludedOnboardingEmail, onboardingMessage } from "../src/lib/onboardingEmails";
import type { OnboardingEmailCandidate } from "../src/lib/database.types";

const candidate: OnboardingEmailCandidate = {
  user_id: "11111111-1111-4111-8111-111111111111",
  email: "alex@example.net",
  full_name: "Alex Pilot",
  unsubscribe_token: "22222222-2222-4222-8222-222222222222",
  stage: "logbooks",
  is_catchup: true,
  aircraft_id: "33333333-3333-4333-8333-333333333333",
  tail_number: "N482RL",
};

test("admin and test-style addresses never enter onboarding mail", () => {
  for (const email of ["iamit@iamit.org", "mfb-demo@mytaillog.com", "e2e@iamit.org", "pilot+test@gmail.com", "mytaillog@joshnisly.com"]) {
    assert.equal(excludedOnboardingEmail(email), true, email);
  }
  assert.equal(excludedOnboardingEmail("warren@example.net"), false);
});

test("catch-up email has a direct next step, safe text, and both unsubscribe methods", () => {
  const message = onboardingMessage({ ...candidate, tail_number: "N482RL<script>" });
  assert.match(message.subject, /N482RL/);
  assert.match(message.html, /N482RL&lt;script&gt;/);
  assert.doesNotMatch(message.html, /N482RL<script>/);
  assert.match(message.html, /aircraft\/33333333-3333-4333-8333-333333333333\/upload/);
  assert.match(message.html, /1321 Upland Dr/);
  assert.match(message.text, /Unsubscribe:/);
  assert.equal(message.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("every stage points to the matching action", () => {
  const routes = {
    aircraft: "/aircraft/enroll",
    logbooks: "/upload",
    extract: "/pages",
    review: "/review",
    success: "/timeline",
  } as const;
  for (const [stage, route] of Object.entries(routes)) {
    const message = onboardingMessage({ ...candidate, stage: stage as OnboardingEmailCandidate["stage"], is_catchup: false });
    assert.ok(message.subject.length > 0, stage);
    assert.ok(message.html.includes(route), stage);
    assert.ok(message.text.includes("Unsubscribe:"), stage);
  }
});
