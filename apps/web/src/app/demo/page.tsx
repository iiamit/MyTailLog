import Image from "next/image";
import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";

export const metadata = {
  title: "Product tour — MyTailLog",
  description: "See how MyTailLog turns aircraft logbook scans into reviewed records, due-item tracking, cited answers, and a searchable maintenance history.",
};

const STEPS = [
  ["Capture the page", "Scan from the mobile app or upload an image or PDF. The original remains attached to the book."],
  ["Review what was read", "AI drafts dates, hours, work and signatures. Confirm each entry beside the ink before it affects your status."],
  ["See what is due", "Status brings inspections, oil, recurring maintenance and ADs together with their date and hour limits."],
  ["Ask and check", "Search every book or ask a plain-English question. Follow the cited entry back to its scanned page."],
  ["Record new work", "Add readings, oil and squawks; write and sign a maintenance entry, then print its logbook sticker."],
  ["Take the record along", "Sync the iPhone, iPad or Android app to browse records and documents offline."],
];

export default function DemoPage() {
  return <MarketingShell eyebrow="Product tour" title="See how the record comes together" lede="The illustration uses our fictional N734DM demo aircraft. Create a free account to explore the live app with its demo data." current="/demo">
    <figure className="overflow-hidden rounded-leaf border border-rule bg-leaf-2">
      <Image src="/brand/status-preview.jpg" alt="Illustration of the new Status board with due items and a cited logbook page" width={1440} height={900} className="h-auto w-full" />
      <figcaption className="p-3 text-small text-ink-3">Illustration of the new design; the values belong to the fictional demo aircraft.</figcaption>
    </figure>
    <div className="mt-8 grid gap-3 sm:grid-cols-2">{STEPS.map(([title, body], i) => <section key={title} className="rounded-leaf border border-rule bg-leaf-2 p-5">
      <span className="text-label text-section-ink-status">{String(i + 1).padStart(2, "0")}</span>
      <h2 className="mt-2 text-heading">{title}</h2><p className="mt-2 text-body text-ink-2">{body}</p>
    </section>)}</div>
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-leaf bg-leaf-2 p-5">
      <div><h2 className="text-heading">Ready to try the demo?</h2><p className="mt-1 text-small text-ink-3">Free account, no card, with N734DM ready to explore.</p></div>
      <Link href="/login?mode=create" className="rounded-control bg-section-status px-5 py-3 font-bold text-white">Create a free account</Link>
    </div>
  </MarketingShell>;
}
