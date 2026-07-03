import Link from "next/link";
import {
  SparklesIcon,
  ClockIcon,
  SearchIcon,
  GaugeIcon,
  WrenchIcon,
  ShieldIcon,
  CpuIcon,
  ScaleIcon,
  AlertIcon,
  ArchiveIcon,
  UsersIcon,
  CameraIcon,
  UploadIcon,
  UserIcon,
} from "@/components/icons";

export const metadata = { title: "Help & documentation — MyTailLog" };

type Section = {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
};

// A "ripple" callout — what a given action changes elsewhere in the app.
function Effects({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
      <span className="font-semibold">Ripple effects: </span>
      {children}
    </div>
  );
}

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500">
    {children}
  </Link>
);

const SECTIONS: Section[] = [
  {
    id: "idea",
    icon: <ShieldIcon />,
    title: "The core idea (read this first)",
    body: (
      <>
        <p>
          MyTailLog is a <strong>searchable index of your physical logbooks</strong> and a
          decision-support layer on top of them — <strong>not</strong> the legal maintenance
          record and not an airworthiness determination. The paper logbooks remain the system
          of record (14 CFR 91.417).
        </p>
        <p className="mt-2">
          Almost everything you see is <em>derived</em> — read from your scans by AI, or computed
          from data you entered. Values can be wrong. Treat MyTailLog as a fast way to find,
          cross-check, and forecast — then confirm anything important against the paper before you
          rely on it. Low-confidence extractions are flagged for exactly this reason.
        </p>
      </>
    ),
  },
  {
    id: "start",
    icon: <SparklesIcon />,
    title: "Getting started",
    body: (
      <ol className="ml-4 list-decimal space-y-1">
        <li>
          <strong>Enroll an aircraft</strong> — the FAA registry lookup fills make/model/serial
          from the tail number. Five logbooks are created automatically: airframe, engine, prop,
          avionics, and <strong>Other</strong>.
        </li>
        <li>
          <strong>Capture or upload</strong> your logbook pages (and A&amp;P documents into Other).
        </li>
        <li>
          <strong>Extract</strong> — AI reads each page into structured entries.
        </li>
        <li>
          <strong>Review</strong> — confirm or correct what it read.
        </li>
        <li>
          Then <strong>Status</strong>, <strong>Maintenance</strong>, <strong>Compliance</strong>,{" "}
          <strong>Ask your logbook</strong>, and the rest come alive from your data.
        </li>
      </ol>
    ),
  },
  {
    id: "capture",
    icon: <CameraIcon />,
    title: "Capture & Upload",
    body: (
      <>
        <p>
          Two ways to get pages in, both landing in the same review queue:
        </p>
        <ul className="ml-4 mt-1 list-disc space-y-1">
          <li>
            <strong>Capture</strong> — use your phone camera. If the document scanner loads, it
            auto-detects the page edges, deskews, and crops; if not, it captures the full frame and
            you crop later. Blurry/glare shots are flagged.
          </li>
          <li>
            <strong>Upload scans</strong> — PDF, JPEG, or PNG. Multi-page PDFs are split into one
            page each, in order.
          </li>
        </ul>
        <p className="mt-2">
          Pick the right <strong>logbook</strong> for what you&apos;re scanning — airframe/engine/
          prop/avionics for running maintenance pages, and <strong>Other</strong> for A&amp;P
          documents (see below). Pages queue on-device and upload when you&apos;re online, so
          capture works in a hangar with no signal.
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Note: scanned logbook spreads sometimes contain two physical pages side by side — the
          extractor flags these so you can review both halves.
        </p>
      </>
    ),
  },
  {
    id: "extract",
    icon: <UploadIcon />,
    title: "Extraction & Review",
    body: (
      <>
        <p>
          Extraction reads a page image into structured entries (date, hours, work performed,
          parts, AD/SB references, signature). Each field gets a confidence score; anything below
          threshold is flagged in the <strong>Review</strong> screen, which shows the page image
          beside the editable entries so you can verify against the original. Editing an entry
          marks it confirmed. You can <strong>re-extract</strong> a page (e.g. if a multi-page
          entry wasn&apos;t linked) right from the review screen — it replaces that page&apos;s
          entries. The <strong>Needs review / Processing</strong> pills on the aircraft page track
          the queue.
        </p>
        <Effects>
          Extracting a running-maintenance page also (best-effort) proposes{" "}
          <L href="#equipment">equipment</L> installs/removals and advances{" "}
          <L href="#maintenance">maintenance</L> last-done dates — so a single scan can shift your
          equipment list, the maintenance forecast, and the <L href="#status">Status</L> grid.
        </Effects>
      </>
    ),
  },
  {
    id: "other",
    icon: <ArchiveIcon />,
    title: 'The "Other" scan type (A&P documents)',
    body: (
      <>
        <p>
          Scan into the <strong>Other</strong> logbook for documents an A&amp;P shop produces that
          aren&apos;t running-log pages. MyTailLog classifies each and <em>applies</em> it instead
          of storing it as log entries:
        </p>
        <ul className="ml-4 mt-1 list-disc space-y-1">
          <li>
            <strong>Weight &amp; Balance sheet</strong> → creates a new{" "}
            <L href="#wb">W&amp;B revision</L> (empty weight, CG, moment), which becomes your
            current W&amp;B.
          </li>
          <li>
            <strong>AD compliance report</strong> → treated as the <strong>ground truth</strong>{" "}
            for your AD state. It corroborates matching tracked ADs (they get a{" "}
            <em>&ldquo;✓ A&amp;P report&rdquo;</em> badge), and creates tracked records for ADs it
            lists that you weren&apos;t tracking yet.
          </li>
        </ul>
        <Effects>
          The AD report never overwrites a compliance record whose logbook-derived date is{" "}
          <em>newer</em> than the report — later logs win over the report baseline. A W&amp;B sheet
          updates your <L href="#wb">Weight &amp; Balance</L>; an AD report updates{" "}
          <L href="#compliance">AD/SB compliance</L> and the <L href="#status">Status</L> grid.
        </Effects>
      </>
    ),
  },
  {
    id: "timeline",
    icon: <ClockIcon />,
    title: "Timeline & Search",
    body: (
      <p>
        Every extracted entry across all logbooks, merged into one date-ordered timeline and
        filterable by logbook type. Full-text search finds work by keyword, part, or AD number
        (e.g. &ldquo;oil change&rdquo;, &ldquo;magneto&rdquo;, &ldquo;AD 2015-19-07&rdquo;). Each
        entry links back to its source page image.
      </p>
    ),
  },
  {
    id: "ask",
    icon: <SparklesIcon />,
    title: "Ask your logbook",
    body: (
      <p>
        Ask plain-English questions (&ldquo;When was the last annual?&rdquo;, &ldquo;Hours since
        prop overhaul?&rdquo;). Answers are drawn <strong>only from your extracted entries</strong>{" "}
        and <strong>cite the specific entries</strong> they came from, so you can click through and
        verify. It won&apos;t invent facts the entries don&apos;t contain — but, like all AI, it can
        misread, so confirm anything you act on.
      </p>
    ),
  },
  {
    id: "status",
    icon: <GaugeIcon />,
    title: "Status overview",
    body: (
      <p>
        The at-a-glance dashboard: every recurring inspection, maintenance item, and AD as a
        color-coded card — <span className="text-red-600 dark:text-red-400">red = overdue</span>,{" "}
        <span className="text-amber-600 dark:text-amber-400">amber = due soon</span>,{" "}
        <span className="text-emerald-600 dark:text-emerald-400">green = current</span> — with days
        and hours remaining. It&apos;s a read-only rollup of your{" "}
        <L href="#maintenance">maintenance forecast</L> and recurring{" "}
        <L href="#compliance">ADs</L>; each card links to where you manage it.
      </p>
    ),
  },
  {
    id: "maintenance",
    icon: <WrenchIcon />,
    title: "Maintenance forecast",
    body: (
      <>
        <p>
          Tracks recurring Part 91 items (annual 91.409, transponder 91.413, pitot-static 91.411,
          ELT 91.207, VOR, 100-hour, oil, TBO, prop overhaul) and computes next-due from the
          interval and last-done. Seed the standard set with one click, mark items done, or add
          your own. Regulatory items are distinguished from advisory ones (TBO/overhaul).
        </p>
        <Effects>
          Due dates depend on <strong>current hours</strong> (the highest of hobbs and tach — total
          time is often on the tach) and on <strong>last-done</strong> data. Extraction and{" "}
          &ldquo;Update from logs&rdquo; advance last-done automatically. The 100-hour resets off the
          later of the last 100-hour <em>or</em> the last annual. Everything here also feeds{" "}
          <L href="#status">Status</L>.
        </Effects>
      </>
    ),
  },
  {
    id: "compliance",
    icon: <ShieldIcon />,
    title: "AD / SB compliance",
    body: (
      <>
        <p>
          Track Airworthiness Directives and Service Bulletins: compliance status (complied /
          previously complied / does-not-apply), method, dates, and recurring intervals →
          next-due. Look up the official FAA reference (Federal Register, with a DRS fallback) to
          confirm applicability, and explore applicability by tail/serial. ADs referenced in your
          logs but not yet tracked are surfaced so you can add them.
        </p>
        <Effects>
          Recurring ADs with a next-due join the <L href="#maintenance">forecast</L> and{" "}
          <L href="#status">Status</L>. Scanning an <L href="#other">A&amp;P AD report</L>{" "}
          corroborates records here and adds the &ldquo;✓ A&amp;P report&rdquo; badge.
        </Effects>
      </>
    ),
  },
  {
    id: "equipment",
    icon: <CpuIcon />,
    title: "Installed equipment",
    body: (
      <>
        <p>
          A reconstructed list of what&apos;s installed now, derived from your logs — installs and
          removals detected during extraction arrive as <strong>proposals</strong> you confirm or
          reject (nothing is trusted automatically). Use &ldquo;Update from logs&rdquo; to rescan
          the full history.
        </p>
        <Effects>
          An equipment install/removal that postdates your last{" "}
          <L href="#wb">Weight &amp; Balance</L> revision flags the W&amp;B as possibly stale — a
          common records gap (avionics swapped, W&amp;B never recomputed).
        </Effects>
      </>
    ),
  },
  {
    id: "wb",
    icon: <ScaleIcon />,
    title: "Weight & Balance",
    body: (
      <>
        <p>
          A history of your W&amp;B revisions (empty weight, CG arm, moment) with the latest as your
          current W&amp;B — plus useful load if you enter max gross. Enter any two of
          weight/arm/moment and the third is filled in. This is an index of your W&amp;B records,
          not a loading calculator.
        </p>
        <Effects>
          If <L href="#equipment">equipment</L> changed after your last revision, a banner flags the
          W&amp;B as out of date. Scanning an <L href="#other">A&amp;P W&amp;B sheet</L> adds a
          revision automatically.
        </Effects>
      </>
    ),
  },
  {
    id: "audit",
    icon: <AlertIcon />,
    title: "Records gap audit",
    body: (
      <p>
        Advisory heuristics that flag <em>suspected</em> gaps in the digitized record: missing
        annuals (breaks in the annual chain), long stretches with no entries, and recurring ADs
        never complied or past due. Framed as &ldquo;suspected&rdquo; — a gap may just mean a page
        isn&apos;t scanned yet.
      </p>
    ),
  },
  {
    id: "export",
    icon: <ArchiveIcon />,
    title: "Export & backup",
    body: (
      <p>
        Print a full records bundle (browser Print → Save as PDF), download CSVs of entries /
        AD-SB / equipment / maintenance, or take a complete <strong>.zip backup</strong> (all
        records + original scans) that you can <strong>re-import</strong> as a new aircraft. Since
        the free tier has no automatic backups, exporting periodically is your safety net — and the
        way to hand an aircraft&apos;s full history to someone else.
      </p>
    ),
  },
  {
    id: "sharing",
    icon: <UsersIcon />,
    title: "Sharing, transfer & delete",
    body: (
      <p>
        Invite others by email as <strong>viewers</strong> (read-only) or <strong>editors</strong>{" "}
        (can contribute) — they get access the moment they sign in with that address, no account
        needed first. Owners can transfer an aircraft to another user, or delete it (type-to-confirm;
        removes all records and scans). Access is enforced by the database, not just the UI.
      </p>
    ),
  },
  {
    id: "profile",
    icon: <UserIcon />,
    title: "Profile & sign-in",
    body: (
      <p>
        Sign in with a magic link (no password) or set a password to use either. Manage your name,
        A&amp;P/IA certificate number, email, and notification preference from{" "}
        <L href="/profile">Profile</L>.
      </p>
    ),
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Dashboard
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-3xl font-bold">Help &amp; documentation</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          What every part of MyTailLog does — and, just as important, how the pieces affect each
          other. The amber <span className="font-medium text-amber-700 dark:text-amber-300">Ripple effects</span>{" "}
          notes call out where one action changes something elsewhere.
        </p>
      </header>

      {/* Table of contents */}
      <nav className="mb-8 grid gap-1 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-2 dark:border-slate-800">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="flex items-center gap-2 rounded px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="text-slate-400">{s.icon}</span>
            {s.title}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-8">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
              <span className="text-slate-400">{s.icon}</span>
              {s.title}
            </h2>
            <div className="text-slate-700 dark:text-slate-200">{s.body}</div>
          </section>
        ))}
      </div>

      <p className="mt-10 border-t border-slate-200 pt-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Reminder: MyTailLog is an index and decision-support tool, not the legal maintenance record.
        Confirm anything you rely on against the physical logbooks.
      </p>
    </main>
  );
}
