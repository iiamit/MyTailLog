import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";
import shotReview from "../../docs/screenshots/review.png";
import shotStatus from "../../docs/screenshots/status.png";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">MyTailLog</h1>
        <p className="mt-3 text-lg text-slate-600 dark:text-slate-300">
          Turn decades of paper airframe, engine, prop, and avionics logbooks
          into a searchable maintenance index — capture or upload scans, let
          vision extraction read them, then track AD/SB compliance, a
          maintenance forecast, and records gaps in one place.
        </p>
      </div>

      <ul className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 dark:text-slate-300">
        {[
          "Capture or upload scans — camera or PDF/JPEG/PNG",
          "Vision extraction with per-field confidence + review",
          "Unified, searchable cross-logbook timeline",
          "AD/SB compliance with FAA reference lookup",
          "Part 91 maintenance forecast from your logs",
          "Records gap audit + full backup/export",
        ].map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden className="text-emerald-500">
              ✓
            </span>
            {f}
          </li>
        ))}
      </ul>

      {/* The two shots that sell it: the extraction next to the real page, and
          the color-coded status payoff. */}
      <div className="flex flex-col gap-3">
        <figure>
          <Image
            src={shotReview}
            alt="Review screen — a handwritten 1979 logbook page beside the AI-extracted entry, with per-field confidence flags"
            placeholder="blur"
            className="w-full rounded-lg border border-slate-200 shadow-sm dark:border-slate-800"
          />
          <figcaption className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            AI reads the page; you review it next to the original — low-confidence
            fields are flagged.
          </figcaption>
        </figure>
        <figure>
          <Image
            src={shotStatus}
            alt="Status overview — every inspection, maintenance item, and AD color-coded by urgency"
            placeholder="blur"
            className="w-full rounded-lg border border-slate-200 shadow-sm dark:border-slate-800"
          />
          <figcaption className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Every inspection, item, and AD at a glance — with email reminders
            before they come due.
          </figcaption>
        </figure>
      </div>

      <Disclaimer />

      <div className="flex gap-3">
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-md bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Go to dashboard
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Sign in
          </Link>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        <strong className="font-medium text-slate-600 dark:text-slate-300">
          Free &amp; open source
        </strong>{" "}
        (
        <a
          href="https://github.com/iiamit/MyTailLog"
          className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
        >
          source on GitHub
        </a>
        , MIT) · an index and decision-support layer, not the legal maintenance
        record ·{" "}
        <Link
          href="/help"
          className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
        >
          see everything it does →
        </Link>
      </p>

      {/* Structured data for search engines. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "MyTailLog",
            applicationCategory: "UtilitiesApplication",
            operatingSystem: "Web",
            url: "https://mytaillog.com",
            description:
              "Free, open-source aircraft logbook digitizer and maintenance tracker for general aviation owners.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />
    </main>
  );
}
