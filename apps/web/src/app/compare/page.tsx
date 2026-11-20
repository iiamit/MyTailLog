import Link from "next/link";
import type { Metadata } from "next";
import { PublicTheme } from "@/components/PublicTheme";
import { ReadSection } from "@/components/public/Read";

export const metadata: Metadata = {
  title: "How MyTailLog compares: six ways to keep aircraft records",
  description:
    "Paper and a filing cabinet, a spreadsheet, a shoebox of photos, a human digitization service, a flight-school ops platform, or MyTailLog. An honest comparison of the approaches, including the rows where MyTailLog loses.",
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
      "Never; you flip pages",
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
      "Hundreds per aircraft; it is labour, so it can't be cheap",
      "A monthly subscription",
      "Free; there is no billing in the app at all",
    ],
  },
  {
    axis: "Who holds the data",
    cells: [
      "You, physically",
      "You; it's a file",
      "You; it's a camera roll",
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
      "A ZIP of every row as JSON plus the original scans, re-importable, and it can already be sitting in your own Dropbox or Drive",
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
      "Run the same code yourself, and the monthly archive in your own cloud doesn't need us to exist",
    ],
  },
  {
    axis: "Automatic offsite copy",
    cells: [
      "No; a hangar fire is a hangar fire",
      "Only if the file lives in a synced folder",
      "Whatever your phone's backup already does",
      "No; you're sent a copy once",
      "Their backups, on their terms, not a copy you hold",
      "Monthly or quarterly to your own Dropbox and/or Google Drive; connect both for two independent copies",
    ],
  },
  {
    axis: "Answers questions, or just stores files?",
    cells: [
      "Stores",
      "Answers only what you built formulas for",
      "Stores",
      "Stores, accurately",
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
      "No; it's transcription, not tracking",
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
      "Strongest: a person read every entry",
      "Exactly what somebody typed",
      "Weaker: a model reads it, scores its own confidence, and you review it against the scan",
    ],
  },
  {
    axis: "Scheduling, dispatch, invoicing",
    cells: [
      "No",
      "No",
      "No",
      "No",
      "Yes; that is the job",
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
      "Free iPhone, iPad, and Android apps: offline records, capture, and queued updates",
    ],
  },
  {
    axis: "Open source / self-hostable",
    cells: ["Doesn't apply", "Doesn't apply", "Doesn't apply", "No", "No", "Yes, MIT licensed"],
  },
  {
    axis: "Is it the legal record?",
    cells: [
      "Yes; this is the record",
      "No",
      "No",
      "No",
      "No",
      "No; an index of the paper, never a replacement for it",
    ],
  },
];

export default function ComparePage() {
  return (
    <PublicTheme
      group="tour"
      path="/compare"
      title="Six ways to keep aircraft records"
      ground="cover"
      lede={
        <p>
          This compares <em>approaches</em>, not products. No vendor is named here, and none is described sideways. We wrote
          the table about ourselves, so the useful part is where we come out behind. Those rows are spelled out below it.
        </p>
      }
    >
      <div className="mx-auto grid max-w-[1180px] gap-2.5 pt-2.5">
        <section aria-labelledby="ledger-h" className="rounded-leaf bg-leaf px-[30px] pt-[26px] pb-7 text-ink shadow-leaf max-sm:px-4">
          <h2 id="ledger-h" className="text-heading">The ledger</h2>
          <p className="mt-1 max-w-[54ch] text-body text-ink-2">Thirteen questions an owner asks of a records system, answered for each approach.</p>

          {/* Wide screens: a ruled ledger that stays inside the leaf. Every column is drawn the same, ours included. */}
          <table className="mt-5 w-full table-fixed border-collapse text-[14px] leading-[1.45] max-[1099px]:hidden">
            <caption className="sr-only">Comparison of six approaches to keeping general aviation maintenance records. The last column is MyTailLog.</caption>
            <colgroup>
              <col className="w-[13%]" />
              {COLS.map((c) => <col key={c} />)}
            </colgroup>
            <thead>
              <tr className="border-b-2 border-ink align-bottom">
                <th scope="col" className="bg-leaf-2 px-2.5 py-2 text-left text-label">Question</th>
                {COLS.map((c) => (
                  <th key={c} scope="col" className="bg-leaf-2 px-2.5 py-2 text-left text-label">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.axis} className="border-b border-rule align-top">
                  <th scope="row" className="px-2.5 py-3 text-left font-bold">{r.axis}</th>
                  {r.cells.map((cell, i) => (
                    <td key={COLS[i]} className="px-2.5 py-3 text-ink">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Narrow screens: one card per question, each answer at full width. */}
          <div className="mt-5 grid gap-3 min-[1100px]:hidden">
            {ROWS.map((r) => (
              <section key={r.axis} aria-label={r.axis} className="rounded-leaf bg-leaf-2 px-4 pt-3 pb-1">
                <h3 className="border-b-2 border-ink pb-2 text-[17px] font-bold">{r.axis}</h3>
                <dl>
                  {r.cells.map((cell, i) => (
                    <div key={COLS[i]} className="grid gap-x-4 gap-y-0.5 border-b border-rule py-2.5 last:border-b-0 sm:grid-cols-[12rem_1fr]">
                      <dt className="text-label text-ink-2">{COLS[i]}</dt>
                      <dd className="text-[15px] text-ink">{cell}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </section>

        <section aria-labelledby="sits-h" className="rounded-leaf bg-leaf px-[30px] pt-[26px] pb-7 text-ink shadow-leaf max-sm:px-4">
          <h2 id="sits-h" className="mb-4 text-heading">Where MyTailLog sits</h2>
          <ReadSection id="win" title="What it does differently" first>
            <p>
              One thing, mostly: <strong>what happens to a record after it&apos;s captured</strong>. A photo is storage. A
              transcription is accurate storage. Here, reading the page is the beginning. The entries feed a searchable
              timeline across logbooks, a status list, a Part 91 forecast, AD tracking with FAA reference lookup, an
              equipment list rebuilt from what the logs say was installed and removed, weight and balance revisions, oil
              wear-metal and consumption trends, a records gap audit, and plain-English questions answered with the source
              entries cited.
            </p>
            <p>
              The second thing is the exit: the MIT licence, a full ZIP of your rows and original scans on demand, and a
              read-only API you consent to app by app. Portability that survives us losing interest is a stronger promise
              than portability that depends on us staying nice.
            </p>
          </ReadSection>
          <ReadSection id="lose" title="Where we lose">
            <p>A comparison table whose author wins every row is an advertisement. These are the rows we don&apos;t win:</p>
            <ul>
              <li>
                <strong>A human beats a model on per-entry certainty.</strong> Paying someone to read every entry gives you a
                person&apos;s guarantee on each one. We give you a confidence-scored draft: a score on every field, the scan
                cropped to where each value was read, and the doubtful ones held back from bulk confirm. That catches what
                the model knows it&apos;s unsure about. It cannot catch what the model was confidently wrong about. Your
                review closes that gap, and it is real work.
              </li>
              <li>
                <strong>No scheduling, dispatch or billing, ever.</strong> If you run a club, a school or a leaseback and
                need a booking calendar, tach-to-invoice dispatch, rental rates or dues, an ops platform does that and we
                deliberately do not. It is on the out-of-scope list, not the roadmap: a second-rate scheduler would cost
                the records depth that is the point of this.
              </li>
              <li>
                <strong>AI reading and Ask need a connection.</strong> The free iPhone, iPad and Android apps browse synced
                records, capture pages and queue updates offline.
              </li>
            </ul>
          </ReadSection>
          <ReadSection id="else" title="When to pick something else">
            <ul>
              <li><strong>An ops platform</strong>, if what keeps you up at night is who has the plane on Saturday and whether the renter got billed.</li>
              <li><strong>A digitization service</strong>, if you would rather pay than spend evenings reviewing, and want a person&apos;s name on every entry.</li>
              <li>
                <strong>Paper and a binder</strong>, if you fly a hundred hours a year, one book covers it, and you can find
                what you need in it. It is the legal record either way, and there&apos;s no shame in that being the whole system.
              </li>
              <li>
                <strong>The spreadsheet you already have</strong>, if it already answers your questions. If you do switch, it
                imports as CSV, so what it costs you is reviewing the paper, not typing the data again.
              </li>
            </ul>
          </ReadSection>
          <ReadSection id="record" title="The row that resets the table">
            <p>
              Only one column answers yes to <em>is it the legal record</em>, and it&apos;s the filing cabinet. Under 14 CFR
              91.417 the physical logbooks are the record, and every other column here, ours included, is an index, a
              convenience or a search tool on top of them. Whatever you choose, keep the paper.
            </p>
            <p>
              More on how the pieces work in <Link href="/help">Help</Link>, and on cost, privacy and export in the{" "}
              <Link href="/faq">FAQ</Link>.
            </p>
          </ReadSection>
        </section>
      </div>
    </PublicTheme>
  );
}
