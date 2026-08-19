import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import review from "../../screenshots/review.png";
import status from "../../screenshots/status.png";
import ask from "../../screenshots/ask.png";
import timeline from "../../screenshots/timeline.png";
import wb from "../../screenshots/wb.png";
import hub from "../../screenshots/hub.png";

export const metadata = {
  title: "Product tour — MyTailLog",
  description: "See how MyTailLog turns aircraft logbook scans into reviewed records, due-item tracking, cited answers, and a searchable maintenance history.",
};

const STEPS: Array<{ title: string; body: string; image: StaticImageData; alt: string }> = [
  { title: "Review every extracted field", body: "The original scan stays beside the structured entry. Confidence is scored field by field so uncertain readings are obvious before you confirm them.", image: review, alt: "A handwritten logbook scan beside its extracted maintenance entry" },
  { title: "See what is due", body: "Inspections, recurring maintenance, and airworthiness directives are ordered by urgency with both calendar and aircraft-hour limits visible.", image: status, alt: "Aircraft maintenance status grid ordered by urgency" },
  { title: "Ask the logbook", body: "Ask a plain-English question and get a concise answer with the source entries cited underneath for verification against the scans.", image: ask, alt: "A logbook question answered with cited maintenance entries" },
  { title: "Search one timeline", body: "Airframe, engine, propeller, avionics, and other records become one chronological, searchable maintenance history.", image: timeline, alt: "Searchable aircraft maintenance timeline" },
  { title: "Keep weight and balance history", body: "Current figures sit above every dated revision, with stale data flagged when later equipment changes may have affected it.", image: wb, alt: "Aircraft weight and balance figures and revision history" },
  { title: "Run the aircraft from one overview", body: "Hours, upcoming work, squawks, oil trends, and recent activity land in one owner-focused view.", image: hub, alt: "Aircraft overview with hours, upcoming maintenance, and squawks" },
];

export default function DemoPage() {
  return (
    <MarketingShell eyebrow="Product tour" title="See the workflow before you sign up" lede="Real screens from the fictional N734DM demo aircraft. No guest account and no aircraft data exposed." current="/demo">
      <div className="space-y-12">
        {STEPS.map((step, index) => (
          <section key={step.title} className="space-y-3">
            <div className="eyebrow">{String(index + 1).padStart(2, "0")}</div>
            <h2 className="text-xl font-semibold">{step.title}</h2>
            <p className="text-dim">{step.body}</p>
            <Image src={step.image} alt={step.alt} sizes="(max-width: 768px) 100vw, 720px" placeholder="blur" className="h-auto w-full rounded-lg border border-line bg-panel2" />
          </section>
        ))}
        <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div><h2 className="font-semibold">Ready to try the real demo?</h2><p className="text-sm text-faint">Free account, no card, with N734DM already loaded.</p></div>
          <Link href="/signup" className="rounded-md bg-accent px-5 py-3 font-medium text-bg hover:opacity-90">Create free account →</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
