// ===========================================================================
// FAA Aircraft Registry lookup by N-number.
//
// The FAA's public Aircraft Inquiry serves a single registration record as HTML
// with clean `data-label="Field">value` cells. We fetch and parse the fields we
// need to prefill an aircraft's make/model/serial/year and engine make/model.
// This is the authoritative registration source (registry.faa.gov). Best-effort
// and unofficial as an API — any failure returns null and the UI falls back to
// manual entry.
// ===========================================================================

const BASE = "https://registry.faa.gov/aircraftinquiry/Search/NNumberResult";

export type RegistryRecord = {
  tailNumber: string;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  year: number | null;
  engineMake: string | null;
  engineModel: string | null;
  registrantName: string | null;
  status: string | null;
};

// Normalize a tail to the FAA's N-number form: no leading "N", uppercase.
function normalizeTail(tail: string): string {
  return tail.trim().toUpperCase().replace(/^N/, "");
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Look up a registration by tail number. Returns null if not found or on any
 *  error (the site is HTML, not a supported API). */
export async function lookupRegistration(
  tail: string,
): Promise<RegistryRecord | null> {
  const n = normalizeTail(tail);
  if (!n) return null;

  let body: string;
  try {
    const res = await fetch(`${BASE}?nNumberTxt=${encodeURIComponent(n)}`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
        accept: "text/html",
      },
    });
    if (!res.ok) return null;
    body = await res.text();
  } catch {
    return null;
  }

  // Collect every data-label cell.
  const fields: Record<string, string> = {};
  for (const m of body.matchAll(/data-label="([^"]+)"[^>]*>\s*([^<]{0,80})/g)) {
    const label = decode(m[1]);
    const value = decode(m[2]);
    if (value && !(label in fields)) fields[label] = value;
  }

  // "Manufacturer Name" only appears for a real result; absent => not found.
  if (!fields["Manufacturer Name"] && !fields["Serial Number"]) return null;

  const yearRaw = fields["Mfr Year"];
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;

  return {
    tailNumber: `N${n}`,
    make: fields["Manufacturer Name"] ?? null,
    model: fields["Model"] ?? null,
    serialNumber: fields["Serial Number"] ?? null,
    year,
    engineMake: fields["Engine Manufacturer"] ?? null,
    engineModel: fields["Engine Model"] ?? null,
    registrantName: fields["Name"] ?? null,
    status: fields["Status"] ?? null,
  };
}
