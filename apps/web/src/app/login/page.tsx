"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PublicRoot } from "@/components/public/PublicRoot";
import { buttonClass } from "@/ui/Button";
import { fieldClass } from "@/ui/Form";
import { createClient } from "@/lib/supabase/client";

type Mode = "magic" | "password";
type SocialProvider = "google" | "apple";

function nextParam(): string {
  if (typeof window === "undefined") return "/dashboard";
  return new URLSearchParams(window.location.search).get("next") || "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("magic");
  // `?mode=create` (marketing CTAs) opens on account creation.
  const createMode = useSearchParams().get("mode") === "create";
  const [signUp, setSignUp] = useState(createMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextParam())}`;

  async function socialSignIn(provider: SocialProvider) {
    setBusy(true);
    setError(null);
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectTo() },
      });
      if (error) throw error;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in could not be started.");
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo() },
        });
        if (error) throw error;
        setNotice(`Check ${email} for your sign-in link.`);
      } else if (signUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo() },
        });
        if (error) throw error;
        if (data.session) {
          router.push(nextParam());
          router.refresh();
        } else {
          setNotice(`Account created. Check ${email} to confirm, then sign in.`);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(nextParam());
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/profile`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setNotice(`Check ${email} for a link to set a new password.`);
  }

  const creating = signUp;
  const providerBtn = "state-layer flex min-h-11 w-full items-center justify-center gap-3 rounded-control disabled:opacity-40";

  return (
    <PublicRoot className="flex flex-col">
      <main id="main-content" className="mx-auto grid w-full max-w-[1000px] flex-1 content-center gap-2.5 px-4 py-8 md:grid-cols-[400px_minmax(0,1fr)] md:py-16">
        <section aria-label="About MyTailLog" className="flex flex-col gap-4 rounded-leaf bg-cover-2 px-[30px] pt-[26px] pb-7 text-on-cover max-md:px-5">
          <Link href="/" className="self-start text-board-title text-on-cover">MyTailLog</Link>
          <p className="text-lede text-on-cover">Your aircraft&apos;s logbooks, photographed, read and searchable, with what is due worked out from the pages themselves.</p>
          <p className="text-body text-on-cover-2">The paper logbooks stay the legal record. MyTailLog is the index to them.</p>
          <p className="text-body text-on-cover-2">Your account opens with the demo aircraft N734DM, a fictional 1978 Cessna 172N, so you can look around before you scan anything.</p>
          <p className="mt-auto text-small text-on-cover-2">Free and open source under the MIT licence.</p>
          <Link href="/" className="inline-flex min-h-11 items-center self-start text-[15px] font-semibold text-on-cover underline underline-offset-4">Back to mytaillog.com</Link>
        </section>

        <section aria-labelledby="signin-title" className="rounded-leaf bg-leaf px-[30px] pt-[26px] pb-7 text-ink shadow-leaf max-md:px-5">
          <h1 id="signin-title" className="text-heading">{creating ? "Create your account" : "Sign in"}</h1>
          <p className="mt-1 text-body text-ink-2">
            {mode === "magic"
              ? "We'll email you a sign-in link. No password to remember."
              : creating
                ? "Create an account with your email and a password."
                : "Sign in with your email and password."}
          </p>

          <div className="mt-5 grid gap-2">
            <button type="button" disabled={busy} onClick={() => socialSignIn("google")}
              className={`${providerBtn} border border-[#747775] bg-white px-4 text-[15px] font-semibold text-[#1f1f1f]`}>
              <img src="/brand/google-g.png" width="20" height="20" alt="" />
              <span>Continue with Google</span>
            </button>
            <button type="button" disabled={busy} onClick={() => socialSignIn("apple")}
              aria-label="Continue with Apple"
              className={`${providerBtn} bg-black`}>
              <img src="/brand/apple-continue.png" width="210" height="44" alt="" />
            </button>
            <p className="text-small text-ink-3">Already have an account? Sign in with email first, then connect Google or Apple in Profile to keep your records together.</p>
          </div>

          <div className="my-5 flex items-center gap-3 text-caption text-ink-3" aria-hidden>
            <span className="h-px flex-1 bg-rule" />or with your email<span className="h-px flex-1 bg-rule" />
          </div>

          <div role="group" aria-label="Sign-in method" className="grid grid-cols-2 gap-1 rounded-control border border-control-border p-1">
            {(["magic", "password"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
                className={`state-layer min-h-10 rounded-[var(--radius-s)] px-3 text-[15px] font-semibold ${mode === m ? "bg-ink text-leaf" : "text-ink"}`}
              >
                {m === "magic" ? "Email me a link" : "Use a password"}
              </button>
            ))}
          </div>

          {notice ? (
            <div role="status" className="mt-4 border-t-2 border-ink bg-leaf-2 px-4 py-3 text-body text-ink">
              {notice}
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 grid gap-4">
              <label className="block text-label" htmlFor="email">
                Email
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-describedby={error ? "signin-error" : undefined}
                  className={fieldClass}
                />
              </label>

              {mode === "password" && (
                <label className="block text-label" htmlFor="password">
                  Password
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={signUp ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={signUp ? "At least 8 characters" : ""}
                    aria-describedby={error ? "signin-error" : undefined}
                    className={fieldClass}
                  />
                </label>
              )}

              {error && <p id="signin-error" role="alert" className="text-small font-semibold text-alarm-text">{error}</p>}

              <button type="submit" disabled={busy} className={`${buttonClass("primary", "l")} w-full`}>
                {busy
                  ? "Working…"
                  : mode === "magic"
                    ? "Email me a sign-in link"
                    : signUp
                      ? "Create account"
                      : "Sign in"}
              </button>
              {mode === "magic" && <p className="text-small text-ink-3">The link signs you in on this device and works once.</p>}

              {mode === "password" && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSignUp((s) => !s);
                      setError(null);
                    }}
                    className={buttonClass("quiet", "s")}
                  >
                    {signUp ? "Have an account? Sign in" : "New here? Create an account"}
                  </button>
                  {!signUp && (
                    <button type="button" onClick={forgotPassword} className={buttonClass("quiet", "s")}>
                      Forgot password?
                    </button>
                  )}
                </div>
              )}
            </form>
          )}
          {error && notice && <p role="alert" className="mt-3 text-small font-semibold text-alarm-text">{error}</p>}

          <p className="mt-6 border-t border-rule pt-4 text-small text-ink-2">
            Not ready to sign up? <Link href="/demo" className="font-semibold text-ink underline underline-offset-4">Look around the demo aircraft</Link>
          </p>
        </section>
      </main>
    </PublicRoot>
  );
}
