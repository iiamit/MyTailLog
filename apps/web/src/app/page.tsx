import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PublicTheme } from "@/components/PublicTheme";
import { ReadSection, Tag } from "@/components/public/Read";
import { StoreBadges } from "@/components/StoreBadges";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/appStore";
import type { MapModel } from "@/lib/mapModel";
import demoMap from "@/lib/public/demoMap.json";
import { StaticMap } from "@/ui/map/StaticMap";
import { TrustMark } from "@/ui/Marks";
import { Verdict } from "@/ui/Verdict";
import { buttonClass } from "@/ui/Button";

// The demo aircraft's map, from the shared N734DM fixture (packages/shared/fixtures/map-model.json): fictional data.
const DEMO_MAP = demoMap as unknown as MapModel;

const VERDICT_TEXT = "2 items are overdue: the annual and the VOR check.";
const DEMO_VERDICT = {
  text: VERDICT_TEXT,
  emphasis: [[0, 19]] as [number, number][],
  lines: ["3 entries read by AI are waiting for you. They don't count until you confirm them."],
};

const STEPS: [string, string][] = [
  ["Add the aircraft", "Type the tail number. The FAA registry fills in make, model and serial, and five logbooks are set up: airframe, engine, propeller, avionics and other."],
  ["Photograph the pages", "Scan with the phone app, even with no signal in the hangar, or upload the PDFs and photos you already have."],
  ["Confirm what was read", "AI drafts each entry with a confidence score on every field. You confirm it beside the scan. Until you do, it changes nothing."],
  ["Use the history", "Search every book, ask a question and get the cited entries, plan the annual, and hand a buyer or IA a record room link."],
];

const KEEPS: [string, string][] = [
  ["What is due", "Inspections, recurring work and ADs by date or hours, each traced back to the entry and page behind it."],
  ["Answers with sources", "Search across your books or ask in plain English. Answers cite the entries and open the scanned page."],
  ["The small things", "Tach and hobbs, oil added, squawks, installed equipment, weight and balance, and the documents you carry aboard."],
  ["New entries", "Write a maintenance entry from a preventive-maintenance template, sign it with your certificate and an emailed code, and print a logbook sticker."],
];

export default async function Home() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const start = user ? "/hangar" : "/login?mode=create";
  const startLabel = user ? "Open your hangar" : "Create a free account";

  return (
    <PublicTheme
      group="tour"
      path="/"
      title="Your logbooks can answer you"
      ground="cover"
      lede={
        <p>
          MyTailLog reads photographed logbook pages into a searchable index, works out what is due from them, and cites
          the page behind every answer. The paper stays the record. Free and open source.
        </p>
      }
    >
      {/* The first spread stays on the open board, like an aircraft's Status: the record on a leaf, its page on the mat. */}
      <div className="-mx-[22px] bg-board px-[22px] pb-[22px] max-lg:-mx-2 max-lg:px-2 max-lg:pb-2">
        <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
          <section aria-label="Demo aircraft N734DM" className="min-w-0 rounded-leaf bg-leaf px-[30px] pt-[22px] pb-6 text-ink shadow-leaf max-sm:px-4">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-2">
              <Tag>Demo aircraft</Tag>
              <span>N734DM, a fictional 1978 Cessna 172N</span>
            </p>
            <div className="mt-3 max-w-[40ch]"><Verdict verdict={DEMO_VERDICT} overdue /></div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-2">
              <span>Annual inspection, Jul 18, 2026</span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block size-2.5 rounded-[2px] bg-line-airframe" />Airframe logbook, p. 6
              </span>
              <TrustMark level="ai_read" />
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link href={start} className={buttonClass("primary", "l")}>{startLabel}</Link>
              <Link href="/demo" className={buttonClass("quiet", "l")}>Look around the demo aircraft</Link>
            </div>
            <p className="mt-3 max-w-[54ch] text-small text-ink-2">
              Reading pages with AI has a daily allowance: about 50 pages in any 24 hours on the shared key. Add your own
              Anthropic key to read more. No card, no trial clock.
            </p>
            <figure className="mt-5 mb-0 border-t border-rule pt-3">
              <StaticMap model={DEMO_MAP} label="The life of N734DM from its four logbooks, 1978 to a year ahead. Dashed stretches are years with no pages; rings ahead are items due." />
              <figcaption className="mt-1 text-caption text-ink-3">The map draws each logbook as a line. Rings ahead of today are what is due; solid vermilion is overdue.</figcaption>
            </figure>
          </section>

          <figure aria-labelledby="scan-cap" className="m-0 flex min-w-0 flex-col gap-3 rounded-leaf bg-mat p-[18px] text-on-cover shadow-leaf">
            <div id="scan-cap" className="text-[13px] leading-[1.45] text-on-cover-2">
              <p className="text-[15px] text-on-cover">Airframe logbook, page 6</p>
              Demo aircraft N734DM. A fictional page, drawn for the demo.
            </div>
            <div className="relative overflow-hidden rounded-[var(--radius-m)]">
              <picture>
                <source srcSet="/brand/n734dm-airframe-p6.webp" type="image/webp" />
                <img
                  src="/brand/n734dm-airframe-p6.jpg"
                  width={1200}
                  height={660}
                  alt="Scanned airframe logbook page 6 for N734DM, with two handwritten entries: a landing light replaced on March 2, 2026, and an annual inspection on July 18, 2026."
                  className="block h-auto w-full"
                />
              </picture>
              {/* The source ink of the cited entry, as a PageCite highlights it (02 §6, 11 §7). */}
              <span aria-hidden className="absolute top-[61%] left-[3%] h-[31%] w-[93%] rounded-[3px] border-2 border-highlight-edge bg-highlight" />
            </div>
            <blockquote className="m-0 border-l-[3px] border-highlight-line pl-3">
              <p className="sr-only">Logbook says:</p>
              <p className="font-paper text-[16px] leading-[1.5] text-on-cover">
                7/18/26 · 4219.6 · Annual inspection. 1. Annual inspection IAW FAR 43 App. D. 2. Complied with AD
                2011-10-09 seat rails, no wear beyond limits. 3. ELT inspected IAW 91.207, battery exp 02/2027. 4. Replaced
                nose strut seals. Aircraft found airworthy and returned to service. D. Alvarez A&amp;P 3105582 IA
              </p>
              <p className="mt-2 text-[13px] text-on-cover-2">
                Read by AI from page 6. The logbook&apos;s own words are set in this serif; everything the app says is in the sans.
              </p>
            </blockquote>
          </figure>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1180px] gap-2.5 pt-2.5">
        <section aria-labelledby="how-h" className="rounded-leaf bg-leaf px-[30px] pt-[26px] pb-7 text-ink shadow-leaf max-sm:px-4">
          <h2 id="how-h" className="text-heading">From paper to an index you can check</h2>
          <p className="mt-1 mb-4 max-w-[54ch] text-body text-ink-2">Most owners start with the newest airframe volume and the last annual. Status fills in from the first page.</p>
          {STEPS.map(([t, b], i) => (
            <ReadSection key={t} title={t} first={i === 0}><p>{b}</p></ReadSection>
          ))}
        </section>

        <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
          <section aria-labelledby="keeps-h" className="rounded-leaf bg-leaf px-[30px] pt-[26px] pb-7 text-ink shadow-leaf max-sm:px-4">
            <h2 id="keeps-h" className="mb-4 text-heading">What it keeps track of</h2>
            {KEEPS.map(([t, b], i) => (
              <ReadSection key={t} title={t} first={i === 0}><p>{b}</p></ReadSection>
            ))}
          </section>
          <section aria-labelledby="yours-h" className="flex flex-col rounded-leaf bg-leaf-2 px-[30px] pt-[26px] pb-7 text-ink shadow-leaf max-sm:px-4">
            <h2 id="yours-h" className="text-heading">Yours to keep</h2>
            <div className="read-prose mt-3">
              <p><strong>The owner keeps the data.</strong> Export everything, scans included, whenever you like, and import it again. Nobody else handles your books.</p>
              <p><strong>Free and open source.</strong> MIT licensed, no subscription. The code is <a href="https://github.com/iiamit/MyTailLog">on GitHub</a>.</p>
              <p><strong>Works in the hangar.</strong> Records open offline on iPhone, iPad and Android, and pages scanned without signal sync later.</p>
            </div>
            <div className="mt-5"><StoreBadges /></div>
          </section>
        </div>

        <section aria-labelledby="start-h" className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-leaf bg-leaf px-[30px] py-6 text-ink shadow-leaf max-sm:px-4">
          <div className="max-w-[54ch]">
            <h2 id="start-h" className="text-heading">Start with one page</h2>
            <p className="mt-1 text-body text-ink-2">
              The paper logbooks are the legal record (14 CFR 91.417). MyTailLog is an index of them that you check against the pages.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={start} className={buttonClass("primary", "l")}>{startLabel}</Link>
            <Link href="/compare" className={buttonClass("quiet", "l")}>How it compares</Link>
          </div>
        </section>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "SoftwareApplication", name: "MyTailLog",
        applicationCategory: "UtilitiesApplication", operatingSystem: "Web, iOS, iPadOS, Android",
        url: "https://mytaillog.com", installUrl: [APP_STORE_URL, PLAY_STORE_URL],
        description: "Free, open-source aircraft logbook digitizer and maintenance tracker with scanned-page review, cited search, maintenance forecasts and offline mobile apps.",
        isAccessibleForFree: true, license: "https://opensource.org/licenses/MIT",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        sameAs: ["https://github.com/iiamit/MyTailLog", APP_STORE_URL, PLAY_STORE_URL],
      }) }} />
    </PublicTheme>
  );
}
