import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell, MarketingSection } from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "How MyTailLog compares — six ways to keep aircraft records",
  description:
    "Paper and a filing cabinet, a spreadsheet, a shoebox of photos, a human digitization service, a flight-school ops platform, or MyTailLog. An honest comparison of the approaches — including the three rows where MyTailLog loses.",
};

// Approaches, not products. No vendor is named, described, or implied here.
const COLS = [
  "Paper + a filing cabinet",
  "A spreadsheet",
  "Photos on your phone",
  "A human digitization service",
  "A flight-school ops platform",
  "MyTailLog",
];

const ROWS: { axis: string; cells: string[] }[] = [
  {
    axis: "Time to searchable records",
    cells: [
      "Never — you flip pages",
      "However long you spend typing",
      "Instant to store, never searchable",
      "Days to weeks, hands-off",
      "However long you spend typing",
      "Minutes per page, plus your review time",
    ],
  },
  {
    axis: "Cost",
    cells: [
      "Free (a binder)",
      "Free",
      "Free",
      "Per aircraft, in the hundreds — it is labour, so it can't be cheap",
      "A monthly subscription",
      "Free; there is no billing in the app at all",
    ],
  },
  {
    axis: "Who holds the data",
    cells: [
      "You, physically",
      "You — it's a file",
      "You — it's a camera roll",
      "You, once it's delivered",
      "They do, on your behalf",
      "You; MIT-licensed, so you can hold the server too",
    ],
  },
  {
    axis: "What you leave with",
    cells: [
      "Nothing to leave",
      "The file",
      "The photos",
      "Whatever was delivered to you",
      "Whatever their export gives you",
      "A ZIP of every row as JSON + the original scans, re-importable",
    ],
  },
  {
    axis: "If it shuts down",
    cells: [
      "Doesn't apply",
      "Doesn't apply",
      "Doesn't apply",
      "You keep the delivered files",
      "You migrate on their timeline",
      "Run the same code yourself",
    ],
  },
  {
    axis: "Answers questions, or just stores files?",
    cells: [
      "Stores",
      "Answers only what you built formulas for",
      "Stores",
      "Stores — accurately",
      "Some: status and due lists",
      "Answers: plain-English Q&A citing the entries, gap audit, equipment rebuilt from the logs",
    ],
  },
  {
    axis: "Tracks what's due",
    cells: [
      "You and your A&P remember",
      "If you built the formulas and keep them current",
      "No",
      "No — it's transcription, not tracking",
      "Yes",
      "Yes: Part 91 recurring items, ADs, email reminders with your own lead times",
    ],
  },
  {
    axis: "Per-entry correctness guarantee",
    cells: [
      "The entry is the record",
      "Exactly what you typed",
      "The image is exact; nothing is structured",
      "Strongest — a person read every entry",
      "Exactly what somebody typed",
      "Weaker — a model reads it, scores its own confidence, and you review it against the scan",
    ],
  },
  {
    axis: "Scheduling, dispatch, invoicing",
    cells: [
      "—",
      "—",
      "—",
      "—",
      "Yes — that is the job",
      "No, and not planned. Explicitly out of scope",
    ],
  },
  {
    axis: "Works with no signal",
    cells: [
      "Perfectly",
      "If the file is on the device",
      "Yes",
      "No",
      "Usually web-only",
      "iOS app (TestFlight beta) browses everything offline and captures offline; no Android app",
    ],
  },
  {
    axis: "Open source / self-hostable",
    cells: ["Doesn't apply", "Doesn't apply", "Doesn't apply", "No", "No", "Yes — MIT"],
  },
  {
    axis: "Is it the legal record?",
    cells: [
      "Yes — this is the record",
      "No",
      "No",
      "No",
      "No",
      "No — an index of the paper, never a replacement for it",
    ],
  },
];

export default function ComparePage() {
  const last = COLS.length - 1;
  return (
    <MarketingShell
      eyebrow="Comparison"
      title="Six ways to keep aircraft maintenance records"
      current="/compare"
      lede={
        <>
          This compares <em>approaches</em>, not products — no vendor is named here, and none is
          being described sideways. We wrote the table about ourselves, so the useful part is where
          we put ourselves last. There are three of those, and they&apos;re called out below.
        </>
      }
    >
      {/*
        Seven columns of prose never fit the shell's max-w-3xl measure — the old
        version set min-w-[60rem] inside a 45rem box, so it scrolled sideways at
        every viewport size and our own column (the point of the page) sat
        off-screen until you dragged it into view.

        Two presentations over the same COLS/ROWS data instead, so no content is
        duplicated: a grid wide enough to scan at xl, and one block per axis
        below that. Neither ever scrolls horizontally.
      */}

      {/* xl and up: break out of the prose measure to 68rem (45rem content box
          + 11.5rem of negative margin each side). Deliberately not vw-based —
          100vw includes the scrollbar and would reintroduce the overflow. */}
      <div className="hidden xl:-mx-[11.5rem] xl:block">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <caption className="sr-only">
            Comparison of six approaches to keeping general aviation maintenance records. The final
            column is MyTailLog.
          </caption>
          <colgroup>
            <col className="w-[13%]" />
            {COLS.map((c) => (
              <col key={c} className="w-[14.5%]" />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-line text-left align-bottom">
              <th className="py-2 pr-3 font-semibold text-ink">Axis</th>
              {COLS.map((c, i) => (
                <th
                  key={c}
                  className={`py-2 font-semibold ${
                    i === last ? "rounded-t bg-panel2 px-3 text-ink" : "pr-3 text-dim"
                  }`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.axis} className="border-b border-line/60 align-top">
                <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">
                  {r.axis}
                </th>
                {r.cells.map((cell, i) => (
                  <td
                    key={COLS[i]}
                    className={`py-2.5 ${i === last ? "bg-panel2 px-3 text-ink" : "pr-3 text-dim"}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below xl: one block per axis. Each answer gets the full measure, which
          suits cells that are sentences rather than yes/no. */}
      <div className="flex flex-col gap-7 xl:hidden">
        {ROWS.map((r) => (
          <section key={r.axis}>
            <h2 className="border-b border-line pb-1.5 font-display text-base font-semibold text-ink">
              {r.axis}
            </h2>
            <dl className="mt-1">
              {r.cells.map((cell, i) => (
                <div
                  key={COLS[i]}
                  className={`grid gap-x-4 gap-y-0.5 border-b border-line/60 py-2 text-[13px] sm:grid-cols-[13rem_1fr] ${
                    i === last ? "-mx-3 rounded bg-panel2 px-3" : ""
                  }`}
                >
                  <dt className={i === last ? "font-semibold text-ink" : "text-faint"}>
                    {COLS[i]}
                  </dt>
                  <dd className={i === last ? "text-ink" : "text-dim"}>{cell}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <div className="mt-12 flex flex-col gap-8">
        <MarketingSection id="lose" title="Where we lose">
          <p>
            A comparison table whose author wins every row is an advertisement. These are the rows
            we don&apos;t win, stated in full rather than buried:
          </p>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <strong>A human beats a model on per-entry certainty.</strong> Paying someone to read
              every entry gives you a person&apos;s guarantee on each one. We give you a
              confidence-scored draft: a percentage on every field, the scan cropped to where each
              value was read from, and the flagged ones held back from bulk-confirm. That catches
              what the model knows it&apos;s unsure about — it cannot catch what the model was
              confidently wrong about. Your review is what closes that gap, and it is real work.
            </li>
            <li>
              <strong>No scheduling, dispatch, or billing — ever.</strong> If you run a club, a
              school, or a leaseback and you need a booking calendar, tach-to-invoice dispatch,
              rental rates, or membership dues, an ops platform does that and we deliberately do
              not. It is on the out-of-scope list, not the roadmap, because building a second-rate
              scheduler would cost the records depth that&apos;s the entire point of this.
            </li>
            <li>
              <strong>Mobile is a beta, and iOS only.</strong> The native app is in TestFlight: it
              browses every entry, document and scan fully offline and captures pages offline, but
              editing existing entries is still done on the web, and there is no Android app.
            </li>
          </ul>
        </MarketingSection>

        <MarketingSection id="else" title="When to pick something else">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>An ops platform</strong> — if the thing keeping you up at night is who has the
              plane on Saturday and whether the renter got billed.
            </li>
            <li>
              <strong>A digitization service</strong> — if you would rather pay money than spend
              evenings reviewing, and you want a person&apos;s name attached to every entry.
            </li>
            <li>
              <strong>Paper and a binder</strong> — if you fly a hundred hours a year, one book
              covers it, and you can find what you need in it. It is still the legal record either
              way, and there&apos;s no shame in that being the whole system.
            </li>
            <li>
              <strong>The spreadsheet you already have</strong> — if it already answers your
              questions. Switching costs you the evenings; only do it if the answers are missing.
            </li>
          </ul>
        </MarketingSection>

        <MarketingSection id="win" title="Where this approach is genuinely different">
          <p>
            One thing, mostly: <strong>what happens to a record after it&apos;s captured</strong>. A
            photo is storage. A transcription is accurate storage. Here, extraction is the beginning
            — the entries feed a searchable cross-logbook timeline, a status grid, a Part 91
            forecast, AD/SB compliance with FAA reference lookup, an equipment list rebuilt from
            what the logs say was installed and removed, weight &amp; balance revisions, oil
            wear-metal and consumption trends, a records-gap audit, and plain-English questions
            answered with the source entries cited.
          </p>
          <p>
            The second thing is the exit. MIT license, a full ZIP of your rows and original scans on
            demand, and a read-only public API you consent to per-app. Portability that survives us
            losing interest is a stronger promise than portability that depends on us staying nice.
          </p>
        </MarketingSection>

        <MarketingSection id="record" title="The row that resets the table">
          <p>
            Only one column answers &ldquo;yes&rdquo; to <em>is it the legal record</em>, and
            it&apos;s the filing cabinet. Under 14 CFR 91.417 the physical logbooks are the system
            of record, and every other column here — ours included — is an index, a convenience, or
            a search tool sitting on top of them. Whatever you choose, keep the paper.
          </p>
          <p className="text-sm text-faint">
            More on how the pieces work in{" "}
            <Link
              href="/help"
              className="underline decoration-line underline-offset-2 hover:decoration-line2"
            >
              Help &amp; documentation
            </Link>
            , and on cost, privacy and export in the{" "}
            <Link
              href="/faq"
              className="underline decoration-line underline-offset-2 hover:decoration-line2"
            >
              FAQ
            </Link>
            .
          </p>
        </MarketingSection>
      </div>
    </MarketingShell>
  );
}
