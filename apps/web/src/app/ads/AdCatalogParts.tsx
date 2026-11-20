import Link from "next/link";
import { Callout } from "@/components/public/Read";
import { buttonClass } from "@/ui/Button";

/** Shown on every /ads page: a listing is text matching, not applicability. */
export function AdListDisclaimer() {
  return (
    <Callout title="A list by name, not an applicability check">
      <p>
        ADs are listed here because their FAA titles or abstracts name the model. That is text matching from Federal
        Register data. Whether an AD applies to a particular aircraft depends on serial-number ranges, installed engines,
        propellers and equipment, and modifications. Your mechanic decides what applies.
      </p>
    </Callout>
  );
}

export function TrackCta() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-5">
      <Link href="/login?mode=create&ref=ad-page" className={buttonClass("primary", "l")}>
        Track these for your aircraft
      </Link>
      <span className="text-small text-ink-2">Free and open source. The AD list for your aircraft lives under Maintenance.</span>
    </div>
  );
}
