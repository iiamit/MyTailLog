import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";
import { ScreenshotCarousel, type Slide } from "@/components/ScreenshotCarousel";
import shotReview from "../../docs/screenshots/review.png";
import shotStatus from "../../docs/screenshots/status.png";
import shotAsk from "../../docs/screenshots/ask.png";
import shotTimeline from "../../docs/screenshots/timeline.png";

const SLIDES: Slide[] = [
  {
    src: shotReview,
    alt: "Review screen — a handwritten 1979 logbook page beside the AI-extracted entry",
    caption: "AI reads the page; you review it next to the original, with low-confidence fields flagged.",
  },
  {
    src: shotStatus,
    alt: "Status overview — inspections, items, and ADs color-coded by urgency",
    caption: "Every inspection, item, and AD at a glance — with email reminders before they come due.",
  },
  {
    src: shotAsk,
    alt: "Ask your logbook — a plain-English answer with cited source entries",
    caption: "Ask in plain English; answers cite the exact entries they came from.",
  },
  {
    src: shotTimeline,
    alt: "Timeline & search across all logbooks",
    caption: "One searchable timeline across every logbook.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">MyTailLog</h1>
        <p className="mt-3 text-lg text-dim">
          Turn decades of paper airframe, engine, prop, and avionics logbooks
          into a searchable maintenance index — capture or upload scans, let
          vision extraction read them, then track AD/SB compliance, a
          maintenance forecast, and records gaps in one place.
        </p>
      </div>

      <ul className="grid gap-2 text-sm text-dim sm:grid-cols-2">
        {[
          "Capture or upload scans — camera or PDF/JPEG/PNG",
          "Vision extraction with per-field confidence + review",
          "Unified, searchable cross-logbook timeline",
          "AD/SB compliance with FAA reference lookup",
          "Part 91 maintenance forecast from your logs",
          "Records gap audit + full backup/export",
        ].map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden className="text-annun-green">
              ✓
            </span>
            {f}
          </li>
        ))}
      </ul>

      {/* One frame, auto-rotating through the shots that sell it. */}
      <ScreenshotCarousel slides={SLIDES} />

      <Disclaimer />

      <div className="flex gap-3">
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-md bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90"
          >
            Go to dashboard
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90"
          >
            Sign in
          </Link>
        )}
      </div>

      <p className="text-sm text-faint">
        <strong className="font-medium text-dim">
          Free &amp; open source
        </strong>{" "}
        (
        <a
          href="https://github.com/iiamit/MyTailLog"
          className="underline underline-offset-2 hover:text-ink"
        >
          source on GitHub
        </a>
        , MIT) · an index and decision-support layer, not the legal maintenance
        record ·{" "}
        <Link
          href="/help"
          className="underline underline-offset-2 hover:text-ink"
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
