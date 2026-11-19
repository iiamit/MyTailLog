import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { ALERT_DEFAULTS, resolveAlerts } from "@/lib/reminders";

// GET   /api/me/preferences → profile.preferences with `alerts` resolved over the defaults (09 §2.11, §4.9)
// PATCH /api/me/preferences { notify_due?, keep_meter_photos?, alerts?: { <key>: {...} | boolean } }
//   → the same shape. PATCH merges: top-level keys replace, each `alerts.<key>` object merges over
//   what is stored, so a phone changing quiet hours keeps the web's lead times. Unknown keys are refused.
export const runtime = "nodejs";

const TOP = new Set(["notify_due", "keep_meter_photos", "alerts"]);
const ALERT_KEYS = new Set(Object.keys(ALERT_DEFAULTS));
type Prefs = Record<string, unknown> & { alerts?: Record<string, unknown> };
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const view = (p: Prefs) => ({ ...p, alerts: resolveAlerts(p as never) });

async function caller(req: Request) {
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(req: Request) {
  const { supabase, user } = await caller(req);
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("profile").select("preferences").eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(view((data?.preferences ?? {}) as Prefs), { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: Request) {
  const { supabase, user } = await caller(req);
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const bad = (error: string) => NextResponse.json({ error, code: "bad_request" }, { status: 400 });
  if (!isObject(body) || JSON.stringify(body).length > 4000) return bad("Expected a preferences object.");
  for (const [k, v] of Object.entries(body)) {
    if (!TOP.has(k)) return bad(`Unknown preference: ${k}.`);
    if (k !== "alerts" && typeof v !== "boolean") return bad(`${k} must be true or false.`);
  }
  if (body.alerts !== undefined) {
    if (!isObject(body.alerts)) return bad("alerts must be an object.");
    for (const [k, v] of Object.entries(body.alerts)) {
      if (!ALERT_KEYS.has(k)) return bad(`Unknown alert setting: ${k}.`);
      const shape = typeof ALERT_DEFAULTS[k as keyof typeof ALERT_DEFAULTS];
      if (shape === "object" ? !isObject(v) : typeof v !== shape) return bad(`alerts.${k} has the wrong shape.`);
    }
  }

  const { data, error } = await supabase.from("profile").select("preferences").eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const current = (data?.preferences ?? {}) as Prefs;
  const alerts: Record<string, unknown> = { ...(current.alerts ?? {}) };
  for (const [k, v] of Object.entries((body.alerts ?? {}) as Record<string, unknown>))
    alerts[k] = isObject(v) ? { ...(isObject(alerts[k]) ? alerts[k] : {}), ...v } : v;
  const next: Prefs = { ...current, ...body, alerts };

  // Column grant 0028 lets the owner update `preferences`; RLS limits it to their row.
  const { error: upError } = await supabase.from("profile").update({ preferences: next as never }).eq("id", user.id);
  if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });
  return NextResponse.json(view(next));
}
