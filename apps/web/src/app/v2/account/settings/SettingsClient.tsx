"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AlertSettings } from "@/lib/reminders";
import type { SigningCredential } from "@/lib/database.types";
import {
  disconnectMfb,
  removeAiKey,
  revokeOAuthClient,
  saveAiKey,
  saveMfbCredentials,
  updateNotifications,
  updateProfile,
} from "@/app/profile/actions";
import { CREDENTIAL_KINDS } from "@/app/profile/credentials/CredentialManager";
import { buttonClass } from "@/ui/Button";
import { Field, fieldClass } from "@/ui/Form";

type Msg = { ok: boolean; text: string } | null;

/** The inline result after a save: polite for success, an alert for a failure. */
export function Said({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <span role={msg.ok ? "status" : "alert"} className={`text-small ${msg.ok ? "text-ink-2" : "font-semibold text-alarm-text"}`}>
      {msg.text}
    </span>
  );
}

const fail = (e: unknown) => ({ ok: false, text: e instanceof Error ? e.message : "That didn't save. Try again." });

/** A ConfirmDialog (02 §7.8) that runs an async action; the safe button has focus. */
export function Confirm({ label, question, confirm, run }: { label: string; question: string; confirm: string; run: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={buttonClass("quiet", "s")} onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog ref={ref} className="m-auto max-w-[440px] rounded-leaf bg-leaf p-6 text-ink shadow-leaf backdrop:bg-mat/60">
        <p className="text-body">{question}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus className={buttonClass("quiet", "m")} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            className={buttonClass("alarm", "m")}
            onClick={async () => {
              ref.current?.close();
              await run();
            }}
          >
            {confirm}
          </button>
        </div>
      </dialog>
    </>
  );
}

/** You: name saves on blur; email change sends a confirmation link. */
export function YouSection({ fullName, email }: { fullName: string; email: string }) {
  const [nameMsg, setNameMsg] = useState<Msg>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<Msg>(null);
  const saved = useRef(fullName);
  return (
    <div className="grid gap-4">
      <Field label="Name">
        <input
          name="full_name"
          defaultValue={fullName}
          autoComplete="name"
          className={fieldClass}
          onBlur={async (e) => {
            const v = e.target.value.trim();
            if (v === saved.current) return;
            const fd = new FormData();
            fd.set("full_name", v);
            const res = await updateProfile(fd).catch((err) => ({ error: fail(err).text }));
            if (!res.error) saved.current = v;
            setNameMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved." });
          }}
        />
      </Field>
      <Said msg={nameMsg} />
      <form
        className="grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setEmailMsg(null);
          const { error } = await createClient().auth.updateUser({ email: newEmail });
          setEmailMsg(error ? { ok: false, text: error.message } : { ok: true, text: `We sent a link to ${newEmail}. The change happens when you open it.` });
        }}
      >
        <p className="text-label">Email</p>
        <p className="-mt-1 text-body">{email}</p>
        <Field label="New email address" help="We send a link there; the change happens when you open it.">
          <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" autoComplete="email" className={fieldClass} />
        </Field>
        <span className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClass("secondary", "s")}>Change</button>
          <Said msg={emailMsg} />
        </span>
      </form>
    </div>
  );
}

/** Signing in: email link, password, Google and Apple. */
export function SigningInSection({ email, identities }: { email: string; identities: string[] }) {
  const search = useSearchParams();
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [linkMsg, setLinkMsg] = useState<Msg>(search.get("identity") === "error" ? { ok: false, text: "Could not connect that sign-in method. Try again." } : null);
  const hasPassword = identities.includes("email");
  return (
    <div className="grid gap-3">
      <p className="flex items-center justify-between gap-3 text-body">
        Email link always works for {email}
        <span className="text-small font-semibold text-ink-2">On</span>
      </p>
      {(["google", "apple"] as const).map((p) => (
        <div key={p} className="flex min-h-[42px] items-center justify-between gap-3 border-t border-rule pt-2 text-body">
          {p === "google" ? "Google" : "Apple"}
          {identities.includes(p) ? (
            <span className="text-small font-semibold text-ink-2">Connected</span>
          ) : (
            <button
              type="button"
              disabled={linking !== null}
              className={buttonClass("secondary", "s")}
              onClick={async () => {
                setLinking(p);
                setLinkMsg(null);
                const { error } = await createClient().auth.linkIdentity({
                  provider: p,
                  options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/account/settings?identity=linked#signing-in")}` },
                });
                if (error) {
                  setLinkMsg({ ok: false, text: error.message });
                  setLinking(null);
                }
              }}
            >
              {linking === p ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>
      ))}
      <Said msg={linkMsg} />
      <form
        className="grid gap-2 border-t border-rule pt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await createClient().auth.updateUser({ password: pw });
          if (error) setPwMsg({ ok: false, text: error.message });
          else {
            setPw("");
            setPwMsg({ ok: true, text: "Password set. You can sign in with it now." });
          }
        }}
      >
        <Field label={hasPassword ? "Change your password" : "Set a password"} help="At least 8 characters.">
          <input type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={fieldClass} />
        </Field>
        <span className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClass("secondary", "s")}>{hasPassword ? "Change" : "Set a password"}</button>
          <Said msg={pwMsg} />
        </span>
      </form>
    </div>
  );
}

/** Signing entries: self-declared certificates used to sign logbook entries. */
export function SigningSection({ initial, userId }: { initial: SigningCredential[]; userId: string }) {
  const [rows, setRows] = useState(initial);
  const [kind, setKind] = useState<SigningCredential["kind"]>("private_pilot");
  const [number, setNumber] = useState("");
  const [rating, setRating] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const kindLabel = (k: string) => CREDENTIAL_KINDS.find(([v]) => v === k)?.[1] ?? k;
  return (
    <div className="grid gap-3">
      {rows.length > 0 && (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map((r) => (
            <li key={r.id} className="flex min-h-11 items-center justify-between gap-3 py-1.5 text-body">
              <span>
                {kindLabel(r.kind)}, certificate ending {r.certificate_number.slice(-4)}
                {r.rating ? ` · ${r.rating}` : ""}
              </span>
              <Confirm
                label="Remove"
                confirm="Remove certificate"
                question={`Remove ${kindLabel(r.kind)}, certificate ending ${r.certificate_number.slice(-4)}? Entries you already signed keep it.`}
                run={async () => {
                  const { error } = await createClient().from("signing_credential").delete().eq("id", r.id).eq("user_id", userId);
                  if (error) setMsg({ ok: false, text: error.message });
                  else setRows((x) => x.filter((y) => y.id !== r.id));
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          if (!number.trim()) return setMsg({ ok: false, text: "Enter the certificate number." });
          setBusy(true);
          const { data, error } = await createClient()
            .from("signing_credential")
            .insert({ user_id: userId, kind, certificate_number: number.trim(), rating: kind === "mechanic" ? rating.trim() || "A&P" : null })
            .select("*")
            .single();
          setBusy(false);
          if (error) return setMsg({ ok: false, text: error.message });
          setRows((x) => [...x, data]);
          setNumber("");
          setRating("");
          setMsg({ ok: true, text: "Certificate saved." });
        }}
      >
        <p className="text-small font-bold text-ink-2">Add a certificate</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Certificate kind">
            <select value={kind} onChange={(e) => setKind(e.target.value as SigningCredential["kind"])} className={fieldClass}>
              {CREDENTIAL_KINDS.map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Certificate number">
            <input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={40} className={fieldClass} />
          </Field>
          {kind === "mechanic" && (
            <Field label="Ratings">
              <input value={rating} onChange={(e) => setRating(e.target.value)} placeholder="A&P" className={fieldClass} />
            </Field>
          )}
        </div>
        <span className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={buttonClass("secondary", "s")}>{busy ? "Saving…" : "Save certificate"}</button>
          <Said msg={msg} />
        </span>
        <p className="text-small text-ink-3">These details are self-declared; MyTailLog does not check FAA privileges.</p>
      </form>
    </div>
  );
}

const KINDS: { key: keyof AlertSettings; label: string; days?: string; hours?: string }[] = [
  { key: "annual", label: "Annual inspection", days: "annual_lead_days" },
  { key: "oil", label: "Oil change", hours: "oil_lead_hours" },
  { key: "ad", label: "ADs and SBs", days: "ad_lead_days", hours: "ad_lead_hours" },
  { key: "default", label: "Everything else", days: "default_lead_days", hours: "default_lead_hours" },
];

/** Reminders: saves the whole preference bag as each control changes (checkbox) or is left (number). */
export function RemindersSection({ notifyDue, onboardingOn, alerts }: { notifyDue: boolean; onboardingOn: boolean; alerts: AlertSettings }) {
  const form = useRef<HTMLFormElement>(null);
  const [on, setOn] = useState(notifyDue);
  const [msg, setMsg] = useState<Msg>(null);
  const [test, setTest] = useState<Msg>(null);
  const save = async () => {
    if (!form.current) return;
    const res = await updateNotifications(new FormData(form.current)).catch((e) => ({ error: fail(e).text }));
    setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved." });
  };
  const num = (name: string, value: number, unit: string, label: string) => (
    <label className="flex items-center gap-1.5 text-small text-ink-2">
      <input type="number" min={0} name={name} defaultValue={value} aria-label={label} onBlur={save} className={`${fieldClass} mt-0 h-[34px] w-20`} />
      {unit}
    </label>
  );
  return (
    <form ref={form} onSubmit={(e) => e.preventDefault()} className="grid gap-3">
      <label className="flex items-start gap-3 text-body">
        <input type="checkbox" name="notify_due" checked={on} onChange={(e) => { setOn(e.target.checked); setTimeout(save); }} className="mt-1 size-[18px] shrink-0" />
        <span className="font-semibold">Email and phone reminders before items come due</span>
      </label>
      {/* Dimmed, not disabled: disabled inputs drop out of the form and their lead times would be reset on save. */}
      <fieldset className={on ? "" : "opacity-60"}>
        <legend className="sr-only">How far ahead, per kind of item</legend>
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-rule text-left text-small text-ink-3">
              <th scope="col" className="py-1.5 font-semibold">Kind of item</th>
              <th scope="col" className="py-1.5 font-semibold">Days ahead</th>
              <th scope="col" className="py-1.5 font-semibold">Hours ahead</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {KINDS.map((k) => {
              const a = alerts[k.key] as { enabled: boolean; lead_days?: number; lead_hours?: number };
              return (
                <tr key={k.key}>
                  <th scope="row" className="py-1.5 text-left font-normal">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name={`${k.key}_enabled`} defaultChecked={a.enabled} onChange={() => setTimeout(save)} className="size-[18px]" />
                      {k.label}
                    </label>
                  </th>
                  <td className="py-1.5">{k.days ? num(k.days, a.lead_days ?? 30, "days", `${k.label}, days ahead`) : <span className="text-ink-3">–</span>}</td>
                  <td className="py-1.5">{k.hours ? num(k.hours, a.lead_hours ?? 25, "hours", `${k.label}, hours ahead`) : <span className="text-ink-3">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </fieldset>
      <label className="flex items-start gap-3 text-body">
        <input type="checkbox" name="onboarding_emails" defaultChecked={onboardingOn} onChange={() => setTimeout(save)} className="mt-1 size-[18px] shrink-0" />
        <span>Setup tips by email while I add my aircraft</span>
      </label>
      <Said msg={msg} />
      <span className="flex flex-wrap items-center gap-3 border-t border-rule pt-3">
        <button
          type="button"
          className={buttonClass("secondary", "s")}
          onClick={async () => {
            setTest({ ok: true, text: "Sending…" });
            try {
              const res = await fetch("/api/push/test", { method: "POST" });
              const b = (await res.json().catch(() => ({}))) as { devices?: number; sent?: number; error?: string; hint?: string };
              if (!res.ok || b.error) setTest({ ok: false, text: `Couldn't send it: ${b.error ?? res.status}` });
              else if (!b.devices) setTest({ ok: false, text: b.hint ?? "No phone is signed in to the app on this account." });
              else setTest({ ok: true, text: `Reached ${b.sent} of ${b.devices} ${b.devices === 1 ? "device" : "devices"}.` });
            } catch {
              setTest({ ok: false, text: "Couldn't reach MyTailLog. Check your connection." });
            }
          }}
        >
          Send a test
        </button>
        <Said msg={test} />
      </span>
      <p className="text-small text-ink-3">Each item can have its own lead time on its page in Status.</p>
    </form>
  );
}

type Ai = { keyLast4: string | null; provider: string | null; calls: number; inputTokens: number; outputTokens: number; costUsd: number; callsToday: number; dailyCap: number };

/** AI reading: the allowance in pages, and the owner's own key. */
export function AiSection({ ai }: { ai: Ai }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  // A page usually takes two reading calls (three with rotated stickers); the cap counts calls.
  const pagesCap = Math.floor(ai.dailyCap / 2);
  const pagesUsed = Math.min(pagesCap, Math.ceil(ai.callsToday / 2));
  const usd = (n: number) => (n > 0 && n < 0.01 ? "under $0.01" : `$${n.toFixed(2)}`);
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return (
    <div className="grid gap-3">
      <div>
        <p className="flex items-baseline justify-between gap-3 text-body">
          <span>
            About <b>{pagesUsed}</b> of {pagesCap} pages today
          </span>
          <span className="text-small text-ink-3">{ai.keyLast4 ? "your key" : "shared allowance"}</span>
        </p>
        <div
          role="meter"
          aria-label="AI pages used today"
          aria-valuemin={0}
          aria-valuemax={pagesCap}
          aria-valuenow={pagesUsed}
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-leaf-2"
        >
          <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (pagesUsed / Math.max(1, pagesCap)) * 100)}%` }} />
        </div>
        <p className="mt-1.5 text-small text-ink-3">Each page frees up 24 hours after it was read, not all at midnight.</p>
      </div>
      <p className="text-body">
        {ai.keyLast4 ? `Using your ${ai.provider === "openai" ? "OpenAI" : "Anthropic"} key ending ${ai.keyLast4}` : "Own key: none"}
      </p>
      {ai.keyLast4 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-small sm:grid-cols-4">
          {[
            ["Cost so far", usd(ai.costUsd)],
            ["AI calls", String(ai.calls)],
            ["Input tokens", k(ai.inputTokens)],
            ["Output tokens", k(ai.outputTokens)],
          ].map(([l, v]) => (
            <div key={l}>
              <dt className="text-ink-3">{l}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <form
        className="grid gap-3"
        action={async (fd) => {
          setBusy(true);
          setMsg(null);
          const res = await saveAiKey(fd).catch((e) => ({ error: fail(e).text }));
          setBusy(false);
          setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Key saved." });
          if (!res.error) router.refresh();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <Field label="Provider">
            <select name="provider" defaultValue={ai.provider ?? "anthropic"} className={fieldClass}>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </Field>
          <Field label="API key">
            <input type="password" name="api_key" autoComplete="off" placeholder={ai.keyLast4 ? `Ending ${ai.keyLast4}; paste to replace` : "Paste the key"} className={fieldClass} />
          </Field>
        </div>
        <span className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={buttonClass("secondary", "s")}>{busy ? "Saving…" : "Save key"}</button>
          {ai.keyLast4 && (
            <Confirm
              label="Remove key"
              confirm="Remove key"
              question="Remove your key? Reading goes back to the shared daily allowance."
              run={async () => {
                const res = await removeAiKey().catch((e) => ({ error: fail(e).text }));
                setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Key removed." });
                if (!res.error) router.refresh();
              }}
            />
          )}
          <Said msg={msg} />
        </span>
      </form>
      <p className="text-small text-ink-3">
        Add an Anthropic or OpenAI key to read without the daily limit. You pay the provider directly. Chat subscriptions don&apos;t include API use.
      </p>
    </div>
  );
}

const MFB_STATUS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "MyFlightBook connected." },
  denied: { ok: false, text: "MyFlightBook said no to the connection." },
  state: { ok: false, text: "Couldn't check the sign-in request. Try again." },
  noclient: { ok: false, text: "Save your MyFlightBook client ID and secret first." },
  error: { ok: false, text: "Something went wrong talking to MyFlightBook." },
};

/** MyFlightBook: status, sync, disconnect, and the owner's own OAuth app credentials. */
export function MfbSection({ mfb, sync }: { mfb: { clientId: string; hasSecret: boolean; connected: boolean; username: string }; sync: React.ReactNode }) {
  const router = useRouter();
  const search = useSearchParams();
  const [msg, setMsg] = useState<Msg>(MFB_STATUS[search.get("mfb") ?? ""] ?? null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-3">
      <p className="flex items-center justify-between gap-3 text-body">
        {mfb.connected ? `Connected as ${mfb.username || "your MyFlightBook account"}` : "Not connected"}
        <span className="text-small font-semibold text-ink-2">{mfb.connected ? "On" : "Off"}</span>
      </p>
      {mfb.connected && (
        <span className="flex flex-wrap items-center gap-2">
          {sync}
          <Confirm
            label="Disconnect"
            confirm="Disconnect"
            question="Disconnect MyFlightBook? Readings already brought in stay."
            run={async () => {
              const res = await disconnectMfb().catch((e) => ({ error: fail(e).text }));
              setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Disconnected." });
              if (!res.error) router.refresh();
            }}
          />
        </span>
      )}
      <form
        className="grid gap-3"
        action={async (fd) => {
          setBusy(true);
          setMsg(null);
          const res = await saveMfbCredentials(fd).catch((e) => ({ error: fail(e).text }));
          setBusy(false);
          setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved." });
          if (!res.error) router.refresh();
        }}
      >
        <Field label="Client ID">
          <input name="mfb_client_id" defaultValue={mfb.clientId} className={fieldClass} />
        </Field>
        <Field label="Client secret" help={mfb.hasSecret ? "Saved. Leave blank to keep it." : undefined}>
          <input type="password" name="mfb_client_secret" autoComplete="off" className={fieldClass} />
        </Field>
        <Field label="MyFlightBook username" help="Optional. Shown as “Connected as”.">
          <input name="mfb_username" defaultValue={mfb.username} className={fieldClass} />
        </Field>
        <span className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={buttonClass("secondary", "s")}>{busy ? "Saving…" : "Save credentials"}</button>
          {mfb.clientId && (
            <a href="/api/myflightbook/authorize" className={buttonClass("secondary", "s")}>
              {mfb.connected ? "Reconnect" : "Connect MyFlightBook"}
            </a>
          )}
          <Said msg={msg} />
        </span>
      </form>
      <p className="text-small text-ink-3">
        MyFlightBook can also send hours here on its own: allow it under Apps you let in, then use “Update from MyTailLog” on its My Aircraft page.
      </p>
    </div>
  );
}

export type AppRow = { clientId: string; name: string; allAircraft: boolean; aircraft: string[]; scopes: string[]; since: string };

/** Apps you let in: OAuth grants, each revocable after a ConfirmDialog. */
export function AppsSection({ initial }: { initial: AppRow[] }) {
  const [apps, setApps] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  if (apps.length === 0) return <p className="text-body text-ink-2">No apps have access.</p>;
  return (
    <>
      <ul className="divide-y divide-rule border-y border-rule">
        {apps.map((a) => (
          <li key={a.clientId} className="flex items-start justify-between gap-3 py-2">
            <span className="text-body">
              <b>{a.name}</b>
              <span className="block text-small text-ink-2">
                reads {a.scopes.join(", ").replace(/[_:]/g, " ")} for {a.allAircraft ? "every aircraft, including new ones" : a.aircraft.join(", ") || "no aircraft"}
              </span>
              <span className="block text-small text-ink-3">since {new Date(a.since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            </span>
            <Confirm
              label="Revoke"
              confirm={`Revoke ${a.name}`}
              question={`Revoke ${a.name}? It loses access straight away.`}
              run={async () => {
                const res = await revokeOAuthClient(a.clientId).catch((e) => ({ error: fail(e).text }));
                if (res.error) setMsg({ ok: false, text: res.error });
                else setApps((x) => x.filter((y) => y.clientId !== a.clientId));
              }}
            />
          </li>
        ))}
      </ul>
      <Said msg={msg} />
    </>
  );
}

/** Sign out, and account deletion through POST /api/account/delete after typing "delete". */
export function LeaveSection() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid justify-items-start gap-3">
      <button
        type="button"
        className={buttonClass("secondary", "m")}
        onClick={async () => {
          await createClient().auth.signOut();
          router.push("/login");
          router.refresh();
        }}
      >
        Sign out
      </button>
      <button type="button" className={`${buttonClass("quiet", "s")} text-alarm-text`} onClick={() => dialog.current?.showModal()}>
        Delete my account
      </button>
      <dialog ref={dialog} aria-labelledby="delete-title" className="m-auto max-w-[480px] rounded-leaf bg-leaf p-6 text-ink shadow-leaf backdrop:bg-mat/60">
        <h2 id="delete-title" className="text-heading">Delete your account?</h2>
        <p className="mt-2 text-body text-ink-2">
          This deletes your account, every aircraft you own with its pages, entries and documents, and your phone sign-ins. Aircraft shared with you are not
          touched. It can&apos;t be undone. Download a backup first from Import and export.
        </p>
        <form
          className="mt-4 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const res = await fetch("/api/account/delete", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ confirm: typed }),
            }).catch(() => null);
            const body = (await res?.json().catch(() => ({}))) as { error?: string };
            if (!res?.ok) {
              setBusy(false);
              setError(body?.error ?? "Couldn't reach MyTailLog. Nothing was deleted.");
              return;
            }
            await createClient().auth.signOut();
            window.location.assign("/");
          }}
        >
          <Field label="Type delete to confirm" error={error ?? undefined}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={fieldClass} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" autoFocus className={buttonClass("quiet", "m")} onClick={() => dialog.current?.close()}>
              Keep my account
            </button>
            <button type="submit" disabled={busy || typed.trim().toLowerCase() !== "delete"} className={buttonClass("alarm", "m")}>
              {busy ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
