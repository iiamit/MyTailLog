// ===========================================================================
// Resolving an aircraft's ICAO 24-bit Mode S address from its tail number.
//
// DO NOT hand-roll the N-number → hex encoder. It was tried: it produced
// `a11d9f` for N172SP where the real address is `a12239`. The encoding has
// enough edge cases (24-letter alphabet with I and O removed, variable-length
// suffixes) that a subtly-wrong implementation silently pulls ANOTHER
// aircraft's flights — an invisible and unacceptable failure.
//
// Resolution order (each verified 2026-08-02):
//   1. aircraft.icao24, if already set          — the caller checks this
//   2. FAA registry "Mode S Code Hex"           — authoritative
//   3. api.adsbdb.com (free, no key)            — fallback only
//   4. manual entry in the meters page          — always available
//
// The result is cached on `aircraft.icao24`; the sweep never re-resolves.
// ===========================================================================

import { lookupRegistration } from "@/lib/faa/registry";

/** True for a well-formed lowercase 24-bit hex address. */
export function isIcao24(v: string | null | undefined): v is string {
  return !!v && /^[0-9a-f]{6}$/.test(v);
}

/** Normalize user input ("A12239", "0xA12239") to storage form. */
export function normalizeIcao24(v: string): string | null {
  const s = v.trim().toLowerCase().replace(/^0x/, "");
  return isIcao24(s) ? s : null;
}

async function fromAdsbdb(tail: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(tail.trim().toUpperCase())}`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { response?: { aircraft?: { mode_s?: string } } };
    const raw = json.response?.aircraft?.mode_s;
    return raw ? normalizeIcao24(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Look up the Mode S hex for a tail number. Best-effort: returns null when
 * neither source knows it, and the UI falls back to manual entry.
 */
export async function resolveIcao24(tail: string): Promise<string | null> {
  const record = await lookupRegistration(tail).catch(() => null);
  return record?.modeSCodeHex ?? (await fromAdsbdb(tail));
}
