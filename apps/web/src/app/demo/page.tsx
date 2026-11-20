import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { PublicTheme } from "@/components/PublicTheme";
import { buttonClass } from "@/ui/Button";
import hub from "@/screenshots/hub.png";
import review from "@/screenshots/review.png";
import status from "@/screenshots/status.png";
import ask from "@/screenshots/ask.png";
import timeline from "@/screenshots/timeline.png";
import wb from "@/screenshots/wb.png";

export const metadata = {
  title: "Product tour",
  description: "See how MyTailLog turns aircraft logbook scans into reviewed records, due-item tracking, cited answers and a searchable maintenance history.",
};

const STEPS: { id: string; title: string; body: string; shot: StaticImageData; alt: string }[] = [
  { id: "aircraft", title: "Open the aircraft", body: "Each aircraft opens on what the records show: what is due next, what waits for review, and how far back each logbook goes.", shot: hub, alt: "The demo aircraft's overview: tracked maintenance items, the next items due, and records coverage by logbook" },
  { id: "review", title: "Review what was read", body: "AI drafts dates, hours, work and signatures from each page. You confirm each entry beside the ink before it counts toward anything.", shot: review, alt: "The review screen: a scanned airframe logbook page on the left, the fields read from it on the right" },
  { id: "status", title: "See what is due", body: "Inspections, oil, recurring work and ADs come together with their date and hour limits, each traced to the entry behind it.", shot: status, alt: "The status screen listing inspections and ADs with their due dates and hours" },
  { id: "ask", title: "Ask and check", body: "Search every book or ask a plain-English question. The answer cites the entries, and each citation opens its scanned page.", shot: ask, alt: "An answer to the question about when the engine was last overhauled, with the cited entry below it" },
  { id: "history", title: "Follow the history", body: "Every confirmed entry sits on one timeline across the airframe, engine, propeller and avionics books.", shot: timeline, alt: "The logbook timeline, entries grouped by year across all logbooks" },
  { id: "small-things", title: "Keep the small things", body: "Weight and balance revisions, equipment, hours and oil live with the logbooks they came from.", shot: wb, alt: "The weight and balance screen with the current empty weight, arm and moment" },
];

export default function DemoPage() {
  return (
    <PublicTheme
      group="tour"
      path="/demo"
      title="Product tour"
      ground="cover"
      lede={<p>Six screens from the app, using the fictional demo aircraft N734DM. Every new account gets the same aircraft to look around before scanning anything.</p>}
    >
      <nav aria-label="Tour steps" className="mx-auto max-w-[1180px] pt-2.5">
        <ol className="flex flex-wrap gap-x-1 gap-y-1">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="state-layer inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-[15px] font-semibold text-on-cover underline-offset-4 hover:underline">
                <span className="tabular-nums text-on-cover-2">{i + 1}</span> {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <ol className="mx-auto grid max-w-[1180px] gap-2.5 pt-2">
        {STEPS.map((s, i) => (
          <li key={s.id} id={s.id} className={`grid scroll-mt-4 gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.62fr)] ${i % 2 ? "lg:[&>*:first-child]:order-2 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]" : ""}`}>
            <section aria-labelledby={`${s.id}-h`} className="flex flex-col rounded-leaf bg-leaf px-[30px] pt-[26px] pb-7 text-ink shadow-leaf max-sm:px-5">
              <p className="text-label text-ink-3">Step {i + 1} of {STEPS.length}</p>
              <h2 id={`${s.id}-h`} className="mt-1 text-heading">{s.title}</h2>
              <p className="mt-2 max-w-[44ch] text-body text-ink-2">{s.body}</p>
              {i < STEPS.length - 1 ? (
                <a href={`#${STEPS[i + 1].id}`} className="mt-auto inline-flex min-h-11 items-center self-start pt-4 text-[15px] font-semibold text-board-ink underline underline-offset-4">
                  Next: {STEPS[i + 1].title}
                </a>
              ) : (
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
                  <Link href="/login?mode=create" className={buttonClass("primary", "l")}>Create a free account</Link>
                  <span className="text-small text-ink-2">Free, no card. N734DM is waiting in your hangar.</span>
                </div>
              )}
            </section>
            <figure className="m-0 flex flex-col gap-2 rounded-leaf bg-mat p-[18px] text-on-cover shadow-leaf">
              <Image src={s.shot} alt={s.alt} sizes="(min-width: 1024px) 700px, 100vw" className="h-auto w-full rounded-[var(--radius-m)]" />
              <figcaption className="text-[13px] leading-[1.45] text-on-cover-2">Demo aircraft N734DM (fictional). Screens from an earlier version of the app.</figcaption>
            </figure>
          </li>
        ))}
      </ol>
    </PublicTheme>
  );
}
