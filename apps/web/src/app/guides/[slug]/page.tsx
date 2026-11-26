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
      ["Review identification pages", "Covers and original-equipment lists can fill source-linked aircraft and equipment details without inventing maintenance entries. Compare suggestions with the current record, keep the full registration including its country prefix, and do not treat a historical equipment list as proof of a current installation."],
      ["Capture in small batches", "Scan one logbook at a time and preserve page order. MyTailLog accepts camera captures and PDF uploads, then extracts dates, times, maintenance descriptions, signatures, AD references, and service-bulletin references. Handwritten pages are read by a stronger AI model that copes better with handwriting; typed and printed pages use a simpler, cheaper text reader."],
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
      ["Follow engine history", "In the new web design, Engine history groups historical compression readings and oil records by documented engine installation and service period. Test pressures remain as written. Accessories are separate from complete engines; ambiguous records stay available for review rather than being combined across engines."],
      ["Track ownership spending", "Costs keeps an owner-only ledger of actual expenses and reserve estimates, with CSV import/export and separate currency totals. Hourly estimates disclose the dates covered by verified readings inside the selected period and use spending only within those dates; hours are not extrapolated across missing dates or meter replacements."],
      ["Prepare an annual packet", "Use Document inbox to review incoming logbook pages, invoices and oil reports before filing. For the annual, download a current PDF summary and explicitly select scans and Documents for an evidence ZIP. Missing records remain flagged. These workspaces are live in the new web design and included in native 2.0 test builds ahead of the public mobile rollout."],
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
      ["Keep an audit trail", "Use the AD list under Maintenance and the maintenance summary to surface open and upcoming items, then verify each conclusion against the physical logbooks and current regulatory material. Export the aircraft archive regularly so scans and structured records remain portable."],
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
  return guide ? { title: guide.title, description: guide.description } : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = GUIDES[slug as GuideSlug];
  if (!guide) notFound();

  return (
    <MarketingShell group="guides" title={guide.title} lede={guide.lede} current={`/guides/${slug}`}>
      <div>
        {guide.sections.map(([title, body], index) => (
          <MarketingSection key={title} id={`step-${index + 1}`} title={title} first={index === 0}>
            <p>{body}</p>
          </MarketingSection>
        ))}
        {slug === "airworthiness-directive-tracking" && (
          <MarketingSection id="ad-list" title="A starting list">
            <p>
              <Link href="/ads">Browse airworthiness directives by aircraft, engine and propeller model</Link>.
            </p>
          </MarketingSection>
        )}
      </div>
      <MarketingSection id="feature-help" title="Put this into practice">
        <p>Follow the <Link href="/help#identification-pages">identification-page guide</Link>,{" "}
          <Link href="/help#document-inbox">Document inbox guide</Link>,{" "}
          <Link href="/help#engine-history">Engine history guide</Link>{" "}
          or <Link href="/help#annual-packet">annual packet guide</Link>. For spending records, start with the{" "}
          <Link href="/help#expense-csv">expense CSV guide and template</Link>.</p>
      </MarketingSection>
      <MarketingSection id="start" title="Try it on your own books">
        <p>
          A free account opens with the demo aircraft N734DM, so you can look around before adding yours.{" "}
          <Link href="/login?mode=create">Create a free account</Link>. Reading pages with AI has a daily allowance of
          about 50 pages in any 24 hours; add your own Anthropic or OpenAI key to read more.
        </p>
      </MarketingSection>
      <nav aria-label="More owner guides" className="border-t border-rule pt-4">
        <h2 className="text-label text-ink-3">More owner guides</h2>
        <ul className="mt-1 flex flex-wrap gap-x-6">
          {Object.entries(GUIDES).filter(([other]) => other !== slug).map(([other, item]) => (
            <li key={other}>
              <Link href={`/guides/${other}`} className="inline-flex min-h-11 items-center font-semibold text-board-ink underline underline-offset-4">{item.title}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </MarketingShell>
  );
}
