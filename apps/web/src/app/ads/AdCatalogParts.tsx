import Link from "next/link";

/** Shown on every /ads page: a listing is text matching, not applicability. */
export function AdListDisclaimer() {
  return (
    <p className="rounded-md border border-line px-4 py-3 text-sm text-dim">
      ADs are listed here because their FAA titles or abstracts name the model. That is text
      matching from Federal Register data, not an applicability determination: whether an AD applies
      to a particular aircraft depends on serial-number ranges, installed engines, propellers and
      equipment, and modifications. Your mechanic decides what applies.
    </p>
  );
}

export function TrackCta() {
  return (
    <p className="mt-10">
      <Link
        href="/?ref=ad-page"
        className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
      >
        Track these for your aircraft, free →
      </Link>
    </p>
  );
}
