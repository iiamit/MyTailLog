import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell, MarketingSection } from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "Coming from MyFBO — rescue your maintenance records",
  description:
    "MyFBO is shutting down and your maintenance history is inside it. MyTailLog is not a MyFBO replacement — no scheduling, dispatch or invoicing — but it will read your exports, PDFs, scans and photos of paper into a searchable, exportable, MIT-licensed record you keep.",
};

const MOVES: { what: string; how: string }[] = [
  {
    what: "Maintenance & inspection history",
    how: "Upload the PDFs, scans, or photos of the pages. A vision model reads each one into structured entries — date, hours, work performed, parts, AD/SB references, signature — with a confidence score per field.",
  },
  {
    what: "AD compliance state",
    how: "Track ADs with FAA reference lookup (Federal Register, with a DRS fallback for legacy ADs). Scan an A&P's AD compliance report into the Other logbook and it becomes the ground truth — corroborating what you already track and adding what you didn't.",
  },
  {
    what: "Installed equipment",
    how: "Reconstructed from the log entries as they're extracted — installs and removals proposed for you to confirm, rather than a list you retype.",
  },
  {
    what: "Weight & balance",
    how: "Scan the W&B sheet into the Other logbook; it becomes a new revision with history, and goes stale-flagged if equipment changes after it.",
  },
  {
    what: "Permanent records",
    how: "Airworthiness certificate, registration, radio station authorization, POH/AFM, STCs, 337s, 8130-3s and manuals go in the Records Vault, next to the logbook scans.",
  },
  {
    what: "Aircraft identity & hours",
    how: "Enrollment fills make, model and serial from the FAA registry by tail number. Enter your current hobbs/tach, then log readings as you go — or connect MyFlightBook and let the daily sync pull them.",
  },
  {
    what: "Open squawks",
    how: "Re-entered by hand (there aren't usually many). Severity and reporter are tracked, and they stay open until a mechanic resolves them.",
  },
];

const DOESNT: { what: string; why: string }[] = [
  {
    what: "Scheduling & the booking calendar",
    why: "Deliberately out of scope. We do not build flight-school ops, and this is not on a roadmap.",
  },
  {
    what: "Dispatch, rental & instruction rates, invoicing, card payments",
    why: "Out of scope. MyTailLog has no billing system of any kind — not for you, and not for your renters.",
  },
  {
    what: "Membership dues and auto-charge",
    why: "Out of scope, same reason.",
  },
  {
    what: "Member, renter and CFI rosters; org roles",
    why: "Sharing is two roles — viewer and editor — scoped to one aircraft. There is no organization layer.",
  },
  {
    what: "Flight logging and pilot currency",
    why: "We track aircraft hours for maintenance forecasting, not flights or pilots. A pilot logbook is a different product.",
  },
  {
    what: "Weather briefing",
    why: "Fully commoditized elsewhere, and unconnected to records.",
  },
  {
    what: "XLSX / Google Sheets imports",
    why: "CSV only. Every spreadsheet saves as CSV in one step, and an XLSX parser is a dependency and a zip/XML reader for no additional outcome. Save as CSV and import that.",
  },
  {
    what: "An automated MyFBO connector",
    why: "There isn't one, and there won't be. This is a manual migration: you export, you upload, we read.",
  },
];

export default function SwitchMyFboPage() {
  return (
    <MarketingShell
      eyebrow="Migration"
      title="MyFBO is going away. Your maintenance history is inside it."
      current="/switch/myfbo"
      lede={
        <>
          Get it out — into something open, exportable, and free. This page is about rescuing the
          records, and it is upfront about the large part of MyFBO that MyTailLog deliberately does
          not do.
        </>
      }
    >
      <div className="mb-10 rounded-lg border border-annun-amber/40 px-4 py-3 text-sm text-annun-amber">
        <p>
          <strong>Read this first: MyTailLog is not a MyFBO replacement.</strong> MyFBO&apos;s core
          was scheduling, dispatch, and billing. MyTailLog does none of those, and won&apos;t —
          they&apos;re on the explicitly-out-of-scope list, not the backlog. If what you need is a
          booking calendar and an invoice run, keep looking; you should hear that here rather than
          three weeks into a migration.
        </p>
        <p className="mt-2">
          What we are is the records half: an AI-read, searchable index of your maintenance history
          that tells you what&apos;s due and hands you everything back on demand.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <MarketingSection id="urgency" title="Do the export first, worry about the destination after">
          <p>
            The one irreversible step in any shutdown is losing access. Before anything else, pull
            every export MyFBO will give you and save it somewhere you control — maintenance
            history, uploaded documents, aircraft details, open squawks. While you&apos;re at it,
            photograph the physical logbooks; they&apos;re the legal record and they&apos;re the one
            copy no vendor can take away.
          </p>
          <p>
            Then you can take your time choosing where it lands. Everything below still works months
            from now on a folder of PDFs and photos.
          </p>
        </MarketingSection>

        <MarketingSection id="ingest" title="We read what you can actually get out">
          <p>
            There is no import wizard that needs their schema, and no ticket to open. Pages come in
            as <strong>PDF, JPEG or PNG</strong> — a multi-page PDF is split into one page each, in
            order — or straight from your phone camera, which detects the page edges, deskews and
            crops. A plain photo of a paper page, taken in the hangar with no signal, queues on the
            device and uploads when you&apos;re back online.
          </p>
          <p>
            Then a vision model reads each page into structured entries, in minutes, with a{" "}
            <strong>confidence score on every field</strong> and a cropped snippet of the scan
            showing where each value came from. It is self-serve and free at the point of use —
            not a transcription service you pay per aircraft and wait weeks for. The flip side,
            stated plainly: <strong>you are the reviewer</strong>. Nobody else checks the entries;
            the app&apos;s job is to show you precisely where to look.
          </p>
          <p>
            If your MyFBO export is a <strong>CSV</strong> rather than paper, you don&apos;t need
            any of that: import it directly. There is no MyFBO-specific importer and there won&apos;t
            be — instead the <strong>columns</strong> are mapped, not the rows. One AI pass reads
            your header and a few sample rows, proposes what each column means, you correct it once,
            and every row is then converted in plain code. Dates are never guessed: the whole date
            column is scanned, and you&apos;re only asked which way round they are if every single
            row genuinely reads both ways.
          </p>
          <p className="text-sm text-faint">
            CSV only — save your spreadsheet as CSV first. Up to 5 MB / 5,000 rows per file, and
            imported entries land unconfirmed so you review them before they drive anything.
          </p>
        </MarketingSection>

        <MarketingSection id="steps" title="What the migration actually looks like">
          <ol className="ml-4 list-decimal space-y-2">
            <li>
              <strong>Enroll the aircraft.</strong> Type the tail number; the FAA registry lookup
              fills make, model and serial. Five logbooks are created — airframe, engine, prop,
              avionics, and Other for A&amp;P documents.
            </li>
            <li>
              <strong>Import your CSV export</strong>, if you have one — pick the logbook, confirm
              what each column means, check the count, import. Everything that came out of MyFBO as
              data goes in as data.
            </li>
            <li>
              <strong>Upload the paper into the right logbook</strong> and let extraction run. Start
              with the last few years if the backlog is large; the searchable index is useful long
              before it&apos;s complete.
            </li>
            <li>
              <strong>Review</strong> with the original page beside the entry. Flagged fields first;
              accept the clean ones in a click.
            </li>
            <li>
              <strong>Take a <code className="readout text-[13px]">.zip</code> backup the same
              day</strong> — every row plus the original scans, re-importable anywhere. That is the
              step that means this never happens to you again.
            </li>
          </ol>
          <p>
            After that, Status, the Part 91 maintenance forecast, AD/SB compliance, the equipment
            list, oil trending, and the records-gap audit all come alive from your own entries, and
            reminder emails arrive before things come due.
          </p>
        </MarketingSection>

        <MarketingSection id="table" title="What moves over, and what doesn't">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <caption className="sr-only">
                Data that transfers into MyTailLog, and MyFBO capabilities that have no equivalent
              </caption>
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="w-1/3 py-2 pr-4 font-semibold text-ink">Moves over</th>
                  <th className="py-2 font-semibold text-ink">How</th>
                </tr>
              </thead>
              <tbody>
                {MOVES.map((r) => (
                  <tr key={r.what} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-4 font-medium text-ink">{r.what}</td>
                    <td className="py-2">{r.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="w-1/3 py-2 pr-4 font-semibold text-annun-red">Doesn&apos;t</th>
                  <th className="py-2 font-semibold text-ink">Why</th>
                </tr>
              </thead>
              <tbody>
                {DOESNT.map((r) => (
                  <tr key={r.what} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-4 font-medium text-ink">{r.what}</td>
                    <td className="py-2">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MarketingSection>

        <MarketingSection id="lockin" title="Why this can't happen to you again here">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>MIT-licensed, public source.</strong> The whole app, schema and security
              policies are yours to run. Nobody can announce a shutdown that takes that away.
            </li>
            <li>
              <strong>A full ZIP export whenever you want one</strong> — a manifest, every row as
              plain JSON, and the original scan and document files. It re-imports into any
              MyTailLog instance, including your own.
            </li>
            <li>
              <strong>No billing to lapse.</strong> There are no plans, no card on file, and nothing
              that flips your account to read-only.
            </li>
            <li>
              <strong>The paper is still the record.</strong> MyTailLog is an index of your
              logbooks under 14 CFR 91.417, never a replacement for them — so the worst case has
              always been losing an index, not losing your history.
            </li>
          </ul>
        </MarketingSection>

        <MarketingSection id="cost" title="What it costs to move">
          <p>
            Nothing. There is no billing in MyTailLog at all, and no migration fee, because there
            are no humans in the loop to pay.
          </p>
          <p>
            The one thing worth planning around: reading pages costs AI calls, so the shared key has
            a per-person daily cap and an overall daily budget. A backlog of several hundred pages
            may take a few days at that rate — or add your own Anthropic API key in Profile and run
            it in one sitting on your own account. The{" "}
            <Link
              href="/faq#cost"
              className="underline decoration-line underline-offset-2 hover:decoration-line2"
            >
              FAQ
            </Link>{" "}
            has the details.
          </p>
        </MarketingSection>
      </div>
    </MarketingShell>
  );
}
