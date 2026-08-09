import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { getCurrentMeters, getLatestRecordedReading, getMeterResets } from "@/lib/aircraftHours";
import { reconcileAdsb } from "@/lib/adsb/reconcile";
import { MetersClient } from "./MetersClient";

export default async function MetersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const ctx = await getAircraftShellContext(supabase, id);
  if (!ctx) notFound();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("enrollment_hobbs, enrollment_tach, enrollment_airframe, enrollment_date, icao24, adsb_enabled")
    .eq("id", id)
    .single();

  const enrollment = {
    hobbs: aircraft?.enrollment_hobbs ?? null,
    tach: aircraft?.enrollment_tach ?? null,
    airframe: aircraft?.enrollment_airframe ?? null,
    date: aircraft?.enrollment_date ?? null,
  };

  const [{ data: resets }, { data: readings }, meters] = await Promise.all([
    supabase
      .from("meter_reset")
      .select("id, meter, reset_date, prior_value, new_value, notes")
      .eq("aircraft_id", id)
      .order("reset_date", { ascending: false }),
    supabase
      .from("hours_reading")
      .select("id, reading_date, hobbs, tach, airframe")
      .eq("aircraft_id", id)
      .eq("source", "manual")
      .order("reading_date", { ascending: false })
      .limit(50),
    getCurrentMeters(supabase, id, enrollment),
  ]);

  // ADS-B is the fallback observer: it only ever speaks up when the recorded
  // hours don't already account for the flying. Skipped entirely when off.
  let adsbSuggestion = null;
  if (aircraft?.adsb_enabled) {
    const [{ data: flights }, latestReading, meterResets] = await Promise.all([
      supabase
        .from("adsb_flight")
        .select("first_seen, airborne_minutes, dismissed_at")
        .eq("aircraft_id", id),
      getLatestRecordedReading(supabase, id, enrollment),
      getMeterResets(supabase, id),
    ]);
    adsbSuggestion = reconcileAdsb({
      flights: flights ?? [],
      latestReading,
      resetDates: meterResets.map((r) => r.date).filter((d): d is string => !!d),
    });
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Aircraft</div>
        <h1 className="font-display text-[27px] font-semibold leading-none">Meters</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-dim">
          What each instrument reads, what the app counts maintenance on, and any meter that has
          been replaced. Record airframe time here too — a sailplane has no tach or hobbs to read
          it from.
        </p>
      </header>

      <MetersClient
        aircraftId={id}
        canEdit={ctx.canEdit}
        face={{ tach: ctx.tach, hobbs: ctx.hobbs, airframe: ctx.airframe }}
        enrollment={enrollment}
        total={{ tach: meters.tach.tach, hobbs: meters.hobbs.hobbs, airframe: meters.airframe.airframe }}
        estimated={{ tach: meters.tach.estimated, hobbs: meters.hobbs.estimated, airframe: false }}
        resets={resets ?? []}
        readings={readings ?? []}
        adsb={{
          enabled: aircraft?.adsb_enabled ?? false,
          icao24: aircraft?.icao24 ?? null,
          suggestion: adsbSuggestion,
        }}
      />
    </main>
  );
}
