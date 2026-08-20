import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingSection, MarketingShell } from "@/components/MarketingShell";

const GUIDES = {
  "digitize-aircraft-logbooks": {
    title: "How to digitize aircraft logbooks",
    description: "A practical workflow for scanning aircraft maintenance logbooks without replacing or risking the physical records.",
    lede: "Turn paper aircraft logbooks into a searchable index while keeping the originals as the legal record.",
    sections: [
      ["Prepare before scanning", "Inventory every airframe, engine, propeller, and avionics volume. Photograph the cover and identifying pages first, keep books in order, and avoid removing bound pages. A phone document scanner is usually enough; even lighting and a flat page matter more than expensive hardware."],
      ["Capture in small batches", "Scan one logbook at a time and preserve page order. MyTailLog accepts camera captures and PDF uploads, then extracts dates, times, maintenance descriptions, signatures, AD references, and service-bulletin references. Handwritten pages use a model selected for harder handwriting; printed records use the lower-cost OCR path."],
      ["Review every extraction", "Machine extraction is a draft, not a maintenance determination. Compare each result with the page image, correct uncertain fields, and confirm it only when the transcription matches. MyTailLog keeps the source scan beside the structured entry so later checks remain possible."],
      ["Protect the originals", "Keep physical records secure and backed by a complete export of the digital index and scans. MyTailLog is not the legal maintenance record; verify anything used for an airworthiness decision against the original records and applicable current data."],
    ],
  },
  "aircraft-maintenance-tracking": {
    title: "Aircraft maintenance tracking for owners",
    description: "Track aircraft inspections, recurring maintenance, squawks, equipment, hours, and due dates from the records you already have.",
    lede: "Build a useful maintenance picture from logbook evidence instead of maintaining a second disconnected spreadsheet.",
    sections: [
      ["Start with the evidence", "Add the aircraft and its logbooks, then scan or import the records you already rely on. Confirm extracted entries before treating them as trusted. The timeline remains linked to the original page image, so a date or tach value can always be checked."],
      ["Record the current meters", "Enter tach, Hobbs, or airframe time readings as they become available. MyTailLog separates recorded readings from estimates and accounts for meter replacements, so an old or estimated value does not silently outrank a newer owner-confirmed reading."],
      ["Turn entries into status", "Track annual and recurring inspections, life-limited equipment, AD and service-bulletin compliance, oil history, and open squawks. Due dates and projected hour limits are planning aids; they do not replace an A&P or IA review."],
      ["Share a concise snapshot", "The maintenance summary combines current status, upcoming attention items, equipment counts, AD/SB counts, and weight-and-balance figures. Print it to PDF or share a redacted text snapshot with an IA, co-owner, or prospective buyer."],
    ],
  },
  "airworthiness-directive-tracking": {
    title: "Airworthiness Directive tracking from aircraft records",
    description: "Organize AD compliance evidence, recurring intervals, and upcoming due items while preserving the mechanic's records as the source of truth.",
    lede: "Make AD evidence easier to find without pretending software can determine applicability on its own.",
    sections: [
      ["Find the recorded compliance", "Search confirmed logbook entries for AD references and review the underlying signed page. A reference alone does not prove applicability or continuing compliance, but it gives an owner or mechanic a fast path back to the evidence."],
      ["Track the disposition", "Record whether an AD is open, complied with, previously complied with, not applicable, or superseded. For recurring directives, capture the calendar or hour interval and the last compliance basis so the next review point is visible."],
      ["Check the whole aircraft", "Applicability can depend on model, serial range, engine, propeller, appliance, or installed modification. MyTailLog can help discover candidates from aircraft and equipment data, but a qualified person must verify current FAA data and the actual configuration."],
      ["Keep an audit trail", "Use the compliance view and maintenance summary to surface open and upcoming items, then verify each conclusion against the physical logbooks and current regulatory material. Export the aircraft archive regularly so scans and structured records remain portable."],
    ],
  },
} as const;

type GuideSlug = keyof typeof GUIDES;

export function generateStaticParams() {
  return Object.keys(GUIDES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = GUIDES[slug as GuideSlug];
  return guide ? { title: `${guide.title} — MyTailLog`, description: guide.description } : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = GUIDES[slug as GuideSlug];
  if (!guide) notFound();

  return (
    <MarketingShell eyebrow="Owner guide" title={guide.title} lede={guide.lede} current={`/guides/${slug}`}>
      <div className="space-y-8">
        {guide.sections.map(([title, body], index) => (
          <MarketingSection key={title} id={`step-${index + 1}`} title={title}>
            <p>{body}</p>
          </MarketingSection>
        ))}
      </div>
      <nav aria-label="More owner guides" className="mt-10 border-t border-line pt-5 text-sm text-dim">
        <span className="mr-3 text-faint">More owner guides:</span>
        {Object.entries(GUIDES).filter(([other]) => other !== slug).map(([other, item]) => (
          <Link key={other} href={`/guides/${other}`} className="mr-3 underline decoration-line underline-offset-2 hover:text-ink">
            {item.title}
          </Link>
        ))}
      </nav>
    </MarketingShell>
  );
}
