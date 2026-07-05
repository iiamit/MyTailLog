"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "magic" | "password";

function nextParam(): string {
  if (typeof window === "undefined") return "/dashboard";
  return new URLSearchParams(window.location.search).get("next") || "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("magic");
  const [signUp, setSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextParam())}`;

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
          setNotice(`Account created — check ${email} to confirm, then sign in.`);
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

  const inputClass =
    "rounded-md border border-line bg-panel2 px-3 py-2 text-ink outline-none focus:border-accent";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold">
          {mode === "password" && signUp ? "Create your account" : "Sign in to MyTailLog"}
        </h1>
        <p className="mt-1 text-sm text-dim">
          {mode === "magic"
            ? "We'll email you a magic link — no password to remember."
            : signUp
              ? "Sign up with your email and a password."
              : "Sign in with your email and password."}
        </p>
      </div>

      {/* Method toggle */}
      <div className="flex gap-1 rounded-lg border border-line p-1 text-sm">
        {(["magic", "password"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${
              mode === m
                ? "bg-accent text-bg"
                : "text-dim hover:bg-panel2 hover:text-ink"
            }`}
          >
            {m === "magic" ? "Magic link" : "Password"}
          </button>
        ))}
      </div>

      {notice ? (
        <div
          className="rounded-md border border-annun-green/40 px-4 py-3 text-sm text-annun-green"
          style={{ background: "var(--grn-bg)" }}
        >
          {notice}
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />

          {mode === "password" && (
            <>
              <label className="text-sm font-medium" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={signUp ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={signUp ? "At least 8 characters" : "••••••••"}
                className={inputClass}
              />
            </>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-md bg-accent px-4 py-2 font-medium text-bg hover:opacity-90 disabled:opacity-60"
          >
            {busy
              ? "Working…"
              : mode === "magic"
                ? "Send magic link"
                : signUp
                  ? "Create account"
                  : "Sign in"}
          </button>

          {error && <p className="text-sm text-annun-red">{error}</p>}

          {mode === "password" && (
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setSignUp((s) => !s);
                  setError(null);
                }}
                className="text-dim underline hover:text-ink"
              >
                {signUp ? "Have an account? Sign in" : "New here? Create an account"}
              </button>
              {!signUp && (
                <button
                  type="button"
                  onClick={forgotPassword}
                  className="text-faint underline hover:text-dim"
                >
                  Forgot password?
                </button>
              )}
            </div>
          )}
        </form>
      )}
    </main>
  );
}
