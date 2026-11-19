import type { Metadata } from "next";
import { cookies } from "next/headers";
import { resolveAlerts } from "@/lib/reminders";
import { THEME_COOKIE, parseTheme } from "@/lib/uiV2";
import { loadSettings } from "@/app/profile/loadSettings";
import { MfbSync } from "@/app/v2/aircraft/[id]/hours/MfbSync";
import { Board, BoardHead, HungSection, Leaf, Leaves } from "@/ui/Board";
import { buttonClass } from "@/ui/Button";
import { HangarShell, loadHangarUser } from "@/ui/HangarShell";
import { ShowShortcutsButton, SingleKeysToggle } from "@/ui/Shortcuts";
import { AiSection, AppsSection, LeaveSection, MfbSection, RemindersSection, SigningInSection, SigningSection, YouSection } from "./SettingsClient";

export const metadata: Metadata = { title: "Settings" };

/** Anchored sections (03 §9.2) get an id so `#reminders` and friends land on them. */
function Anchor({ id, title, first, children }: { id: string; title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-4">
      <HungSection title={title} first={first}>
        {children}
      </HungSection>
    </div>
  );
}

/**
 * W-ACCOUNT-02 Settings. Replaces /profile and /profile/credentials. Changes save as they are made, except the groups
 * that must be submitted together (password, own key, MyFlightBook credentials, a certificate).
 */
export default async function SettingsPage() {
  const { supabase, user, profile: shellProfile, fleet } = await loadHangarUser("/account/settings");
  const [{ profile, mfb, ai, connectedApps }, { data: creds }] = await Promise.all([
    loadSettings(supabase, user.id),
    supabase.from("signing_credential").select("*").eq("user_id", user.id),
  ]);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const email = user.email ?? "";
  const back = encodeURIComponent("/account/settings#accessibility");

  return (
    <HangarShell user={user} profile={shellProfile} fleet={fleet}>
      <Board section="setup">
        <BoardHead title="Settings" spine={false} actions={<span>Changes save as you make them</span>} />
        <Leaves split="1.2fr 1fr">
          <Leaf label="You and reminders">
            <Anchor id="you" title="You" first>
              <YouSection fullName={profile?.full_name ?? ""} email={email} />
            </Anchor>
            <Anchor id="signing-in" title="Signing in">
              <SigningInSection email={email} identities={(user.identities ?? []).map((i) => i.provider)} />
            </Anchor>
            <Anchor id="signing" title="Signing entries">
              <p className="mb-2 text-small text-ink-3">
                <span className="rounded-[3px] border border-rule-2 px-1.5 py-px font-semibold text-ink-2">self-declared</span>
              </p>
              <SigningSection initial={creds ?? []} userId={user.id} />
            </Anchor>
            <Anchor id="reminders" title="Reminders">
              <RemindersSection
                notifyDue={Boolean(profile?.preferences?.notify_due)}
                onboardingOn={!profile?.onboarding_opt_out}
                alerts={resolveAlerts(profile?.preferences)}
              />
            </Anchor>
            <Anchor id="accessibility" title="Accessibility">
              <div className="grid gap-4">
                <SingleKeysToggle />
                <span>
                  <ShowShortcutsButton />
                </span>
                <div role="group" aria-labelledby="appearance-label">
                  <p id="appearance-label" className="text-body font-semibold">Appearance</p>
                  <div className="mt-2 inline-flex rounded-control border border-control-border p-0.5">
                    {(["system", "light", "dark"] as const).map((t) => (
                      <a
                        key={t}
                        href={`/api/ui?theme=${t}&next=${back}`}
                        aria-current={theme === t ? "true" : undefined}
                        className={`state-layer flex h-[34px] items-center rounded-[calc(var(--radius-control)-2px)] px-3 text-button-s ${theme === t ? "bg-ink text-leaf" : "text-ink"}`}
                      >
                        {t === "system" ? "Match system" : t === "light" ? "Light" : "Dark"}
                      </a>
                    ))}
                  </div>
                  <p className="mt-1.5 text-small text-ink-3">Reduced motion and larger text follow your device settings.</p>
                </div>
                <div>
                  <p className="text-body font-semibold">Design</p>
                  <p className="mt-0.5 mb-2 text-small text-ink-3">You&apos;re on the new design. The current one stays available for a while.</p>
                  <a href={`/api/ui?design=v1&next=${encodeURIComponent("/hangar")}`} className={buttonClass("secondary", "s")}>
                    Switch back to the current design
                  </a>
                </div>
              </div>
            </Anchor>
          </Leaf>
          <Leaf label="Connections">
            <Anchor id="ai" title="AI reading" first>
              <p className="mb-2 text-small text-ink-3">logbook pages and Ask</p>
              <AiSection ai={ai} />
            </Anchor>
            <Anchor id="myflightbook" title="MyFlightBook">
              <MfbSection
                mfb={{ clientId: mfb?.client_id ?? "", hasSecret: Boolean(mfb?.has_secret), connected: Boolean(mfb?.connected), username: mfb?.mfb_username ?? "" }}
                sync={<MfbSync />}
              />
            </Anchor>
            <Anchor id="apps" title="Apps you let in">
              <AppsSection initial={connectedApps} />
              <a href="/developers" className="mt-2 inline-block text-small font-semibold underline decoration-dotted">Developer API</a>
            </Anchor>
            <Anchor id="offline" title="Offline copy">
              <p className="text-body text-ink-2">
                Everything can be edited offline in the phone app and uploads when you reconnect. Reading pages, Ask and adding an aircraft need a connection.
              </p>
            </Anchor>
            <Anchor id="sign-out" title="Sign out">
              <LeaveSection />
            </Anchor>
          </Leaf>
        </Leaves>
      </Board>
    </HangarShell>
  );
}
