import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PublicTheme } from "@/components/PublicTheme";
import { buttonClass } from "@/ui/Button";
import hangar from "@/screenshots/v2-hangar.png";
import review from "@/screenshots/v2-review.png";
import status from "@/screenshots/v2-status.png";
import entry from "@/screenshots/v2-entry.png";
import map from "@/screenshots/v2-map.png";
import wb from "@/screenshots/v2-wb.png";

export const metadata = {
  title: "Product tour",
  description: "See how MyTailLog turns aircraft logbook scans into reviewed records, due-item tracking, cited answers and a searchable maintenance history.",
};

const STEPS: { id: string; title: string; body: string; shot: StaticImageData; alt: string }[] = [
  { id: "aircraft", title: "Open the hangar", body: "Every aircraft you keep or can view has a card that says, in one line, what is overdue and what is due soon.", shot: hangar, alt: "The hangar: the demo aircraft N734DM with 3 items overdue, 2 due soon and 13 confirmed entries" },
  { id: "review", title: "Review what was read", body: "AI drafts dates, hours, work and signatures from each page, least certain field first. You check each one beside the ink before the entry counts toward anything.", shot: review, alt: "The review desk: fields read from an airframe logbook entry, with the date marked unsure, beside the scanned page and a close-up of the handwritten date" },
  { id: "status", title: "See what is due", body: "Inspections and recurring checks sit on a line across the next twelve months, with a table of date and hour limits underneath. The page behind the most urgent item is open beside it.", shot: status, alt: "The status screen: 3 items overdue, a line of due dates across the airframe, engine, propeller and avionics, and the table of limits, beside the scanned page behind them" },
  { id: "page", title: "Check it against the page", body: "Every entry shows who read it, who confirmed it and who signed it, next to the scanned page it came from. Search every book from anywhere, or ask a plain-English question and follow the cited entries.", shot: entry, alt: "An annual inspection entry with its trust marks, the work as written and the tach reading, beside its scanned airframe logbook page" },
  { id: "history", title: "Follow the history", body: "Each logbook is a line on one map, from the first entry to the next visit due. Gaps show where pages are missing, and any stop opens its page.", shot: map, alt: "The logbooks map: 48 years of airframe, engine, propeller and avionics lines, with a selected avionics entry and its scanned page" },
  { id: "small-things", title: "Keep the small things", body: "Weight and balance revisions, equipment, hours and oil live with the logbooks they came from. When later work may have changed the weight, the page says so.", shot: wb, alt: "The weight and balance screen: a note that the figures may be stale, the current empty weight, arm, moment and useful load, and the revision history" },
];

export default function DemoPage() {
  return (
    <PublicTheme
      group="tour"
      path="/demo"
      title="Product tour"
      ground="cover"
      lede={<p>Six screens from the app, using the fictional demo aircraft N734DM. Every new account gets the same aircraft to look around before scanning anything. These are the app&apos;s new design; if your account opens in the earlier one, choose Try the new design at the top of an aircraft&apos;s screens.</p>}
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
              <figcaption className="flex flex-wrap items-center justify-between gap-x-4 text-[13px] leading-[1.45] text-on-cover-2">
                Demo aircraft N734DM (fictional).
                <a href={s.shot.src} target="_blank" rel="noopener" aria-label={`${s.title}: open the screenshot full size in a new tab`} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-on-cover underline underline-offset-4">
                  Open full size <ExternalLink aria-hidden size={16} />
                </a>
              </figcaption>
            </figure>
          </li>
        ))}
      </ol>
    </PublicTheme>
  );
}
