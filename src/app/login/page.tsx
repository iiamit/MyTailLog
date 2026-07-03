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
    "rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold">
          {mode === "password" && signUp ? "Create your account" : "Sign in to MyTailLog"}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {mode === "magic"
            ? "We'll email you a magic link — no password to remember."
            : signUp
              ? "Sign up with your email and a password."
              : "Sign in with your email and password."}
        </p>
      </div>

      {/* Method toggle */}
      <div className="flex gap-1 rounded-lg border border-slate-200 p-1 text-sm dark:border-slate-800">
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
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {m === "magic" ? "Magic link" : "Password"}
          </button>
        ))}
      </div>

      {notice ? (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-200">
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
            className="mt-1 rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {busy
              ? "Working…"
              : mode === "magic"
                ? "Send magic link"
                : signUp
                  ? "Create account"
                  : "Sign in"}
          </button>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {mode === "password" && (
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setSignUp((s) => !s);
                  setError(null);
                }}
                className="text-slate-600 underline hover:text-slate-900 dark:text-slate-300"
              >
                {signUp ? "Have an account? Sign in" : "New here? Create an account"}
              </button>
              {!signUp && (
                <button
                  type="button"
                  onClick={forgotPassword}
                  className="text-slate-500 underline hover:text-slate-700 dark:text-slate-400"
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
