import Link from "next/link";
import { AccountShell } from "@/components/shell/AccountShell";
import {
  SparklesIcon,
  ClockIcon,
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
  PlaneIcon,
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
    <div
      className="mt-3 rounded-md border border-annun-amber/40 px-3 py-2 text-sm text-annun-amber"
      style={{ background: "var(--amb-bg)" }}
    >
      <span className="font-semibold">Ripple effects: </span>
      {children}
    </div>
  );
}

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="underline decoration-line underline-offset-2 hover:decoration-line2">
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
          <strong>Explore the demo</strong> — every account gets a read-only demo aircraft
          (N734DM) on the dashboard, so you can poke at Status, Timeline, and Ask before
          scanning anything of your own.
        </li>
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
    id: "mobile",
    icon: <SparklesIcon />,
    title: "Mobile app (beta)",
    body: (
      <>
        <p>
          A native <strong>iPhone / iPad app</strong> is in TestFlight beta. It syncs your aircraft once,
          then works <strong>fully offline</strong> — browse every log entry, document, and original
          scanned page with no signal — and lets you <strong>capture new logbook pages offline</strong>{" "}
          that upload when you&apos;re back online. It stays in sync with everything you do on the web.
        </p>
        <Effects>
          Today the app is view-everything-offline plus offline capture; editing existing entries is still
          done on the web. It&apos;s rolling out through TestFlight — more soon.
        </Effects>
      </>
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
        <p className="mt-2 text-sm text-faint">
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
          parts, AD/SB references, signature). Each field gets its own confidence score, shown as a
          percentage right on that field in the <strong>Review</strong> screen — anything below
          threshold is highlighted. Beside each field you also get a cropped snippet of the scan
          showing where that value was read from, so you can confirm it without hunting the whole
          page (snippets appear once a page is extracted under the current model; re-extract older
          pages to get them). The full page image sits alongside the entries too. Editing an entry
          marks it confirmed. You can <strong>re-extract</strong> a page (e.g. if a multi-page
          entry wasn&apos;t linked) right from the review screen — it replaces that page&apos;s
          entries. The <strong>Logbook pages</strong> view (in the left nav) lists every captured
          scan grouped by logbook with its <strong>Needs review / Processing</strong> status, and can
          be <strong>sorted</strong> — within each logbook — by upload order, entry date, or tach,
          ascending or descending (the choice is remembered). Sorting reorders pages inside their
          own logbook, never across logbooks; date/tach come from a page&apos;s extracted entries, so
          an early logbook you uploaded late still sorts into chronological place. Filter to a single
          logbook and hit <strong>Reorder</strong> to hand-arrange its pages with the ↑/↓ arrows —
          handy for scans captured out of order. The
          aircraft <strong>Overview</strong> summarizes how many pages still need review.
        </p>
        <p>
          To move faster, <strong>Review all</strong> (in the left nav) puts every
          extracted entry in one scrollable list — edit inline and confirm as you go, or hit{" "}
          <strong>Confirm N clean</strong> to accept, in one click, every entry the AI was fully
          confident on (high overall score, no flagged field, not a page-spanning fragment).
          Anything with a low-confidence field is left for you; use <strong>Open page ↗</strong> on
          any group to check it against the original scan.
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
    id: "duplicates",
    icon: <AlertIcon />,
    title: "Duplicates & fixes",
    body: (
      <>
        <p>
          Re-uploading, re-capturing, or re-extracting the same page can leave
          duplicate scans and entries behind. <strong>Duplicates &amp; fixes</strong>{" "}
          (in the left nav, editor-only) flags likely duplicates by matching on
          date, tach/hobbs, and work text — grouping pages that look like the
          same scan and entries that look like the same logged event. One copy in
          each group is marked <strong>suggested keep</strong>; delete any of the
          others. Deleting a page also removes its entries. Matches are
          heuristic, so review each group against the source scan (each row has an{" "}
          <strong>Open</strong> link) before deleting.
        </p>
        <p>
          It also flags <strong>mis-keyed hobbs/tach readings</strong> — a value
          below an earlier reading (a dropped digit, e.g. <em>303</em> for{" "}
          <em>3,302</em>) or an unusually large jump (a fat-finger, e.g.{" "}
          <em>33,303</em>) — and suggests the corrected number. <strong>Accept</strong>{" "}
          it, edit the value first, or <strong>Keep mine</strong> if it&apos;s
          right; either way it won&apos;t re-flag. This covers both log entries and
          MyFlightBook-synced readings. It also catches a <strong>Hobbs value that&apos;s
          just the Tach duplicated</strong> into both fields (they should differ) — offering
          to <strong>Clear</strong> the bogus Hobbs while keeping the Tach.
        </p>
        <Effects>
          Deleting duplicate entries or pages updates your{" "}
          <L href="#extract">review</L> counts and the <L href="#timeline">timeline</L>;
          if a deleted entry drove a <L href="#maintenance">maintenance</L> last-done
          date or <L href="#status">status</L> item, re-scan or adjust as needed.
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
        color-coded card — <span className="text-annun-red">red = overdue</span>,{" "}
        <span className="text-annun-amber">amber = due soon</span>,{" "}
        <span className="text-annun-green">green = current</span> — with days
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
          Each item counts down on the meter it&apos;s tracked against. By default that&apos;s the{" "}
          <strong>oil change</strong> on <strong>Hobbs</strong> (the meter you fly and record it
          on — so a fresh Hobbs reading from a MyFlightBook sync advances it directly), and
          everything else engine/airframe — <strong>100-hour, Engine TBO, prop, ADs</strong> — on{" "}
          <strong>tach</strong>. Those are only defaults: every item has a{" "}
          <strong>&ldquo;Hours counted on&rdquo;</strong> setting, so if you track oil on the tach —
          or fly an aircraft with no Hobbs meter at all — set it there and the countdown follows.
          Aircraft with no Hobbs reading on record fall back to tach on their own rather than
          counting against a converted figure. When the needed meter has no recent reading, the
          other is converted via this aircraft&apos;s own hobbs↔tach ratio and marked{" "}
          <em>&ldquo;est.&rdquo;</em> — except <strong>airframe</strong>, which is never estimated.
          See <L href="#meters">Meters</L>.
          Extraction and{" "}
          &ldquo;Update from logs&rdquo; advance last-done automatically. The 100-hour resets off the
          later of the last 100-hour <em>or</em> the last annual. Everything here also feeds{" "}
          <L href="#status">Status</L>.
        </Effects>
      </>
    ),
  },
  {
    id: "meters",
    icon: <GaugeIcon />,
    title: "Meters, replacements & airframe time",
    body: (
      <>
        <p>
          <L href="/aircraft">Aircraft → Meters &amp; resets</L> shows what each instrument reads and
          lets you record two things the logbook alone can&apos;t express: a meter that was{" "}
          <strong>replaced</strong>, and <strong>airframe time</strong>.
        </p>
        <p>
          A hobbs or tach that gets swapped restarts near zero. Record the replacement — the date,
          the old meter&apos;s final reading, and what the new one started at — and MyTailLog stitches
          the two together into one continuous total. Without it, importing older logbook pages makes
          time appear to run backwards: the boundary reading gets flagged as a typo, and any item
          last done before the swap counts down against a number it can never reach. Both meters are
          handled the same way, and an aircraft can have more than one replacement on file.
        </p>
        <p>
          <strong>Airframe</strong> is a third, independent meter for sailplanes and motorgliders. A
          glider has no engine to drive a tach, and a motorglider accrues far more airframe time than
          engine time, so airframe is never derived from the other two — it shows only what has
          actually been recorded. Enter it on a logbook entry, at enrollment, or by hand on this page.
        </p>
        <Effects>
          A recorded replacement changes every hours figure in the app: current meters, last-done
          baselines, countdowns, and reminders all move onto the stitched total. The top bar keeps
          showing what the instrument physically reads. Editors and owners can record and remove
          these; viewers see them read-only.
        </Effects>
      </>
    ),
  },
  {
    id: "squawks",
    icon: <AlertIcon />,
    title: "Squawks",
    body: (
      <>
        <p>
          Track discrepancies noticed in flight — a rough mag, a sticky switch, a small leak. In{" "}
          <L href="/aircraft">Aircraft → Squawks</L>, anyone with access to the aircraft (including a
          shared pilot) can report one with a severity; it stays <strong>open</strong> until an editor
          marks it <strong>resolved</strong>.
        </p>
        <Effects>
          Reporting is open to viewers and pilots, but only editors and the owner can resolve, reopen,
          or delete a squawk. Resolved squawks stay on file for history.
        </Effects>
      </>
    ),
  },
  {
    id: "oil-analysis",
    icon: <GaugeIcon />,
    title: "Oil analysis",
    body: (
      <>
        <p>
          Owners periodically send an oil sample to a lab (Blackstone, AVLab, …) and get back a
          report of wear-metal concentrations. In{" "}
          <L href="/aircraft">Aircraft → Oil analysis</L>, click{" "}
          <strong>Import oil report</strong> and upload the lab&apos;s PDF (or a photo of it). The AI
          reads every sample in the report — dates, hours on the oil and engine, each element in
          parts per million, oil properties, and the lab&apos;s written comments.
        </p>
        <p className="mt-2">
          Each wear metal is charted over time against the lab&apos;s <strong>universal average</strong>{" "}
          for your engine type (the dashed line). Values above it are highlighted amber, and well
          above (2×) red — a prompt to watch, not a verdict.
        </p>
        <p className="mt-2">
          Separately, log each <strong>oil top-off</strong> (&ldquo;added 1.5 qt&rdquo;) with the
          tach/hobbs at the time — the meters prefill from the aircraft&apos;s current reading. From
          those, MyTailLog charts your <strong>burn rate</strong> (hours per quart) between top-offs —
          a leading indicator of engine health, distinct from the lab wear-metal trend above.
        </p>
        <p className="mt-2 text-sm text-faint">
          Like all extraction here, the numbers are read by AI — confirm anything important against
          the original report, and treat the lab&apos;s own assessment as authoritative. Re-importing
          the same report updates its samples in place rather than duplicating them.
        </p>
      </>
    ),
  },
  {
    id: "myflightbook",
    icon: <PlaneIcon />,
    title: "MyFlightBook (hours sync)",
    body: (
      <>
        <p>
          Connect your own <strong>MyFlightBook</strong> pilot logbook to pull each
          aircraft&apos;s latest recorded <strong>hobbs and tach</strong> into MyTailLog. There is{" "}
          <strong>no app-wide account</strong>: in <L href="/profile">Profile → MyFlightBook</L> you
          register your <em>own</em> OAuth app on MyFlightBook and paste its client ID and secret
          (the secret is stored <strong>encrypted</strong> server-side and never shown again), then click{" "}
          <strong>Connect</strong> and approve access. Once connected, <strong>Sync</strong> matches
          your MyFlightBook aircraft to MyTailLog aircraft <strong>by tail number</strong> and
          records the ending hours from the most recent flight.
        </p>
        <p className="mt-2">
          Because matching is by tail, a <strong>shared aircraft</strong> can receive hours from{" "}
          <em>any</em> connected co-owner — whoever flew (and logged) most recently supplies the
          current reading.
        </p>
        <p className="mt-2 text-sm text-faint">
          Honesty caveat: MyFlightBook has no authoritative &ldquo;current&rdquo; meter for a
          shared plane, and a flight&apos;s ending hours may go unlogged. So this is the latest{" "}
          <strong>recorded</strong> hobbs/tach, shown as <em>&ldquo;as of &lt;date&gt;&rdquo;</em> —
          treat it as the last known reading, not a live gauge, and confirm against the aircraft.
        </p>
        <Effects>
          A synced reading feeds <strong>current tach</strong> (reconciled across logs, enrollment,
          and synced readings — hobbs converted to tach when needed), so it flows straight into the{" "}
          <L href="#maintenance">maintenance forecast</L>, recurring{" "}
          <L href="#compliance">AD next-due</L>, and the <L href="#status">Status</L> grid.
        </Effects>
      </>
    ),
  },
  {
    id: "ai-key",
    icon: <SparklesIcon />,
    title: "AI & your Anthropic key",
    body: (
      <>
        <p>
          Extraction and Q&amp;A run on <strong>Claude</strong>. By default they use the app&apos;s
          shared key, which has a <strong>daily limit</strong> (both per person and an overall daily
          budget). If the shared budget for the day is used up, AI pauses until tomorrow. To bill AI
          usage to your own account and get a much higher limit, add your own{" "}
          <strong>Anthropic API key</strong> in <L href="/profile">Profile → AI &amp; your Anthropic
          key</L>. Your key is <strong>stored encrypted</strong> and never shown again; only the last
          four characters are kept for display.
        </p>
        <p className="mt-2 text-sm text-faint">
          This must be an <strong>API key</strong> (starts with <code>sk-ant-</code>) from the{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line hover:decoration-line2"
          >
            Anthropic Console
          </a>
          , where you add a little pay-as-you-go credit. A <strong>Claude.ai (Pro/Max) subscription
          won&apos;t work</strong> — it&apos;s a separate product with no API access.
        </p>
        <p className="mt-2">
          With your own key connected, the panel shows your <strong>usage</strong> — calls, input and
          output tokens, and <strong>estimated cost so far</strong> (from token counts at
          Anthropic&apos;s list prices; a close guide, not your exact invoice). If your key is
          rejected (invalid or out of quota) the request fails with a clear message — it is never
          silently charged to the shared key.
        </p>
      </>
    ),
  },
  {
    id: "notifications",
    icon: <AlertIcon />,
    title: "Notifications (reminder emails)",
    body: (
      <>
        <p>
          A daily background check emails you <strong>before</strong> maintenance, inspections, and
          ADs come due — and once they&apos;re overdue. Turn reminders on and tune the lead times in{" "}
          <L href="/profile">Profile → Notifications</L>. The master switch is the on/off for{" "}
          <em>all</em> reminder email; below it, each category sets how far in advance you&apos;re
          warned:
        </p>
        <ul className="ml-4 mt-1 list-disc space-y-1">
          <li>
            <strong>Annual inspection</strong> — a number of <em>days</em> before it&apos;s due
            (default 90).
          </li>
          <li>
            <strong>Oil change</strong> — a number of <em>hours</em> before it&apos;s due (default
            10).
          </li>
          <li>
            <strong>ADs / SBs</strong> and <strong>everything else</strong> — both a days-before and
            an hours-before window (defaults 30 days / 25 hours); whichever is reached first triggers
            the reminder.
          </li>
        </ul>
        <p className="mt-2">
          Reminders are grouped into <strong>one digest email per day</strong>, organized by
          aircraft, each item linking to its Status page. You&apos;re reminded once per due-cycle:
          after you mark an item done and it schedules a new next-due, the reminder arms again for the
          next cycle. You never get an empty email.
        </p>
        <p className="mt-2 text-sm text-faint">
          Note: the oil-change <em>interval</em> (hours between changes) is set on the oil item on
          each aircraft&apos;s <L href="#maintenance">Maintenance</L> page — the setting here only
          controls how early you&apos;re alerted, not when the item is due.
        </p>
        <Effects>
          What counts as &ldquo;due&rdquo; comes straight from the{" "}
          <L href="#status">Status</L> grid — <strong>current tach</strong> (logs, enrollment, and{" "}
          <L href="#myflightbook">MyFlightBook</L> syncs, hobbs converted to tach when needed) and
          last-done dates drive it. The same
          daily job also auto-syncs connected MyFlightBook accounts once a day, so a reminder can
          reflect hours flown since you last opened the app.
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
          confirm applicability. ADs referenced in your logs but not yet tracked are surfaced so
          you can add them.
        </p>
        <p>
          <strong>Explore</strong> searches for ADs you might not know about, three ways at once:
          by <strong>manufacturer</strong> (the airframe make plus every installed
          equipment&apos;s make — the broad net), by <strong>model</strong> (your specific
          variant — the sharp one), and by any <strong>keyword</strong> you type. Results come
          from the Federal Register plus the FAA&apos;s DRS, which is what surfaces the{" "}
          <strong>pre-1994 legacy ADs</strong> the Federal Register archive doesn&apos;t hold; if
          either source is unreachable the other still returns. Each result lists the{" "}
          <strong>models the AD names</strong>, with yours highlighted and those results sorted
          first, so you can see whether your variant is actually named instead of guessing from
          the make. <strong>Track this AD</strong> adds it in one click as a one-time item, or{" "}
          <em>Track with an interval</em> records it as recurring on hours, calendar months, or
          both, with a next-due.
        </p>
        <p className="text-dim">
          Search results are a starting point, not a determination. The parsed model list is read
          off the AD&apos;s title and summary and can be incomplete — real applicability often
          turns on serial numbers and installed equipment. Confirm against the AD itself; the call
          is yours and your A&amp;P&apos;s. For ground truth, scan an{" "}
          <L href="#other">A&amp;P AD compliance report</L>.
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
    id: "records-vault",
    icon: <ArchiveIcon />,
    title: "Records Vault",
    body: (
      <>
        <p>
          A home for the aircraft&apos;s <strong>permanent records</strong> — airworthiness
          certificate, registration, radio station authorization, POH/AFM, weight &amp; balance,{" "}
          <strong>STCs</strong>, 337s, 8130-3s, ICAs, and manuals. In{" "}
          <L href="/aircraft">Aircraft → Records Vault</L>, upload a PDF or photo (up to 25 MB), tag it
          with a category and reference number, and it&apos;s a click away instead of buried in a
          binder. These sit alongside your logbook scans.
        </p>
        <p className="mt-2 text-sm text-faint">
          Editors can add and remove documents; anyone with access can view and download them. A
          document can also be attached to a specific maintenance entry.
        </p>
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
        A&amp;P/IA certificate number, email, and <L href="#notifications">notification settings</L>{" "}
        from <L href="/profile">Profile</L>.
      </p>
    ),
  },
  {
    id: "developer-api",
    icon: <UserIcon />,
    title: "Developer API (OAuth)",
    body: (
      <p>
        Other apps (like MyFlightBook) can read your aircraft&apos;s airworthiness, equipment, hours,
        oil, and weight-and-balance data — <strong>only with your consent</strong>, and{" "}
        <strong>read-only</strong>. On the consent screen you choose the scope: <strong>all your
        aircraft</strong> (the default — including any you add later, so an app keeps working as your
        fleet grows) or <strong>only the ones you pick</strong>. A brand-new account can authorize an
        app before adding any aircraft — the app just sees an empty list until you add one. Revoke any
        app anytime under <L href="/profile">Profile → Connected apps</L>. Building an integration?
        Register an app and read the guide under <L href="/developers">Developer API</L>. Your
        transcribed log entries are never shared.
      </p>
    ),
  },
];

export default function HelpPage() {
  return (
    <AccountShell>
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Account</div>
        <h1 className="font-display text-[27px] font-semibold leading-none">Help &amp; documentation</h1>
        <p className="mt-2 text-dim">
          What every part of MyTailLog does — and, just as important, how the pieces affect each
          other. The amber <span className="font-medium text-annun-amber">Ripple effects</span>{" "}
          notes call out where one action changes something elsewhere.
        </p>
      </header>

      {/* Table of contents */}
      <nav className="mb-8 grid gap-1 rounded-lg border border-line p-4 text-sm sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="flex items-center gap-2 rounded-sm px-2 py-1 text-dim hover:bg-panel2"
          >
            <span className="text-faint">{s.icon}</span>
            {s.title}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-8">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
              <span className="text-faint">{s.icon}</span>
              {s.title}
            </h2>
            <div className="text-dim">{s.body}</div>
          </section>
        ))}
      </div>

      <p className="mt-10 border-t border-line pt-4 text-sm text-faint">
        Reminder: MyTailLog is an index and decision-support tool, not the legal maintenance record.
        Confirm anything you rely on against the physical logbooks.
      </p>
    </main>
    </AccountShell>
  );
}
