import Link from "next/link";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/appStore";
import { InformationShell } from "@/components/InformationShell";
import { Callout, ReadSection } from "@/components/public/Read";
import { StatusMark } from "@/ui/Marks";

export const metadata = {
  title: "Help",
  description: "How every part of MyTailLog works: logbooks, status, maintenance, aircraft, documents and sharing, and how each part affects the others.",
};

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
};

// What one action changes elsewhere in the app.
const Effects = ({ children }: { children: React.ReactNode }) => <Callout title="What this changes elsewhere">{children}</Callout>;

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href}>
    {children}
  </Link>
);

const SECTIONS: Section[] = [
  {
    id: "idea",
    title: "The core idea (read this first)",
    body: (
      <>
        <p>
          MyTailLog is a <strong>searchable index of your physical logbooks</strong>{" "}and a
          decision-support layer on top of them. It is <strong>not</strong>{" "}the legal maintenance
          record, and it never decides whether the aircraft may fly. The paper logbooks remain the system
          of record (14 CFR 91.417).
        </p>
        <p>
          Almost everything you see is <em>derived</em>: read from your scans by AI, or computed
          from data you entered. Values can be wrong. Treat MyTailLog as a fast way to find,
          cross-check, and forecast, then confirm anything important against the paper before you
          rely on it. Low-confidence extractions are flagged for exactly this reason.
        </p>
      </>
    ),
  },
  {
    id: "designs",
    title: "Two designs, same records",
    body: (
      <>
        <p>
          MyTailLog is moving to a new design, and this guide uses its names. Your account may still open in the
          earlier design until you switch: choose <strong>Try the new design</strong>{" "}on a computer, at the top of an aircraft&apos;s
          screens, and <strong>Switch back</strong>{" "}from the account menu if you prefer. Your records are the same in
          both. Where a screen has a different name in the earlier design:
        </p>
        <ul>
          <li>Status: <strong>Status &amp; forecast</strong></li>
          <li>Maintenance, Squawks: <strong>Status, Squawks</strong></li>
          <li>Maintenance, Annual: <strong>Workflows, Annual prep</strong>{" "}and <strong>Records gaps</strong></li>
          <li>Logbooks, Pages: <strong>Records, Logbook pages</strong></li>
          <li>Search or ask: <strong>Records, Timeline &amp; Ask</strong></li>
          <li>Aircraft, Hours and engine: <strong>Hours &amp; oil</strong></li>
          <li>Account, How you sign in: <strong>Profile, How you sign in</strong></li>
        </ul>
      </>
    ),
  },
  {
    id: "start",
    title: "Getting started",
    body: (
      <ol>
        <li>
          <strong>Explore the demo</strong>: every account gets a read-only demo aircraft
          (N734DM) in the Hangar, so you can explore Status, Logbooks, and Search or ask before
          scanning anything of your own.
        </li>
        <li>
          <strong>Enroll an aircraft</strong>: the FAA registry lookup fills make/model/serial
          from the tail number, here or in the <L href="#mobile">mobile app</L>. Five logbooks are
          created automatically: airframe, engine, prop, avionics, and <strong>Other</strong>.
          If you skipped engine or propeller serial numbers, open Aircraft details on the web and choose{" "}
          <strong>Edit aircraft details</strong>{" "}to add them later. The standard Part 91 items
          (annual, transponder, pitot-static, ELT) are added for you.
        </li>
        <li>
          <strong>Start with the logbooks or enter details manually</strong>: setup is optional.
          Upload identification pages and recent service records, then review the extracted information.
          Confirmed details, inspection history and recorded meter readings are reused, so you only need
          to supply missing information. A last service reading may be older than today&apos;s actual meter reading;
          check its date and source. You can choose <strong>Skip for now</strong>{" "}at any time.
        </li>
        <li>
          <strong>Capture or upload</strong>{" "}your logbook pages (and A&amp;P documents into Other).
        </li>
        <li>
          <strong>Extract</strong>: AI reads each page into structured entries.
        </li>
        <li>
          <strong>Review</strong>: confirm or correct what it read.
        </li>
        <li>
          Then the six sections fill in from your data: <strong>Status</strong>,{" "}
          <strong>Logbooks</strong>, <strong>Maintenance</strong>, <strong>Aircraft</strong>,{" "}
          <strong>Documents</strong>{" "}and <strong>Share</strong>, plus <strong>Ask</strong>.
        </li>
      </ol>
    ),
  },
  {
    id: "identification-pages",
    title: "Identification and reference pages",
    body: <>
      <p>A cover, original-equipment list or reference page is a valid part of a logbook. It does not need a maintenance entry, date, meter reading or signature. In Logbooks → Review, check the page type and any suggested aircraft or equipment details beside the original scan. Mixed pages can contain both details and maintenance entries.</p>
      <p>Compare each suggestion with the current record, edit any misread characters, then accept or dismiss it. Accepted details keep a source-page link. Old equipment lists create historical records unless you explicitly confirm that the equipment is installed today. Resolve the suggestions, then mark the reference page reviewed; it stays in Pages and search without creating a maintenance completion or an artificial timeline event.</p>
      <p>For existing uploads, open aircraft setup and choose <strong>Find aircraft details in existing pages</strong>. On the native apps, open a page, choose Review, then <strong>Find aircraft details in this page</strong>. Reading uses the usual allowance and keeps confirmed entries and prior review decisions.</p>
      <p>Mobile decisions can be saved offline. Sync before continuing review of the same page; if another person changed the destination record, review its current values before accepting again. Viewers cannot accept changes.</p>
      <p>In Equipment, <strong>This record represents</strong>{" "}distinguishes a complete engine from its accessories. The Engine category also includes pumps and magnetos. Engine history uses complete engines, and keeps compression readings with uncertain engine assignments under <strong>Unassigned observations</strong>. A missing test reference pressure is never assumed.</p>
    </>,
  },
  {
    id: "mobile",
    title: "Mobile apps",
    body: (
      <>
        <p>
          Download the free <L href={APP_STORE_URL}>iPhone / iPad app from the App Store</L>{" "}or{" "}
          <L href={PLAY_STORE_URL}>Android app from Google Play</L>. Sync your aircraft once to
          browse records and capture updates offline, even when the hangar has no signal. The
          iPhone and iPad app needs iOS or iPadOS 18 or later, and the Android app needs Android 10 or later. AI extraction and Ask need a connection.
        </p>
        <p>
          <strong>Status</strong>{" "}works without a connection and shows what the records say is due: current
          tach and hobbs with where each reading came from, then every maintenance item and recurring
          AD worst-first, with the same countdowns and calendar-month rules the web app uses. The
          aircraft list flags the worst one, so you see a problem before you open anything.
        </p>
        <p>
          <strong>Record</strong>{" "}writes back. Type the meters you&apos;re looking at (pre-filled, and
          it warns if the number is lower than the last one), log oil you added, raise a squawk, or
          mark a recurring item done. A <strong>VOR check</strong>{" "}asks for the place, the bearing
          error and your signature, because <strong>91.171(d)</strong>{" "}requires those recorded and
          signed, so it resets the counter <em>and</em>{" "}writes a real log entry, rather than just
          moving a due-date.
        </p>
        <p>
          Everything you record is saved on the device immediately and uploads on the next sync. A{" "}
          <strong>Waiting to upload</strong>{" "}list shows anything still queued, and keeps the reason on
          anything the server refused, nothing you record disappears quietly.
        </p>
        <p>
          <strong>Review</strong>{" "}happens on the phone now, not only on the web. Entries sit beside
          the scan, in a drawer you swipe up on an iPhone, in the pane next to it on an iPad, with
          a <strong>Check this</strong>{" "}chip on any field the extractor was unsure of. Tap the
          page mark beside a value to light the exact ink it was read from, and it stays lit while you edit. <strong>Confirm N clean</strong>{" "}accepts every confident entry in
          one tap, on the same rule the web reviewer uses; entries the extractor missed can be keyed
          in, and one that runs onto the next page can be merged into the one before it.
        </p>
        <p>
          <strong>Inspections, ADs and equipment are managed, not just read.</strong>{" "}Add an
          inspection or edit its interval, mark any item done, seed the standard Part 91 items, track
          an AD and record compliance against it, or record an installation and a removal, the
          directive that only applied because of that component turns itself off, with the reason
          written down. <strong>Squawks</strong>{" "}are resolved on the device (naming the entry that
          cleared them), reopened, edited or deleted, and{" "}
          <strong><L href="#ask">Ask your logbook</L></strong>{" "}answers from the phone with the entries
          it used listed underneath.
        </p>
        <h3 id="owner-workspace" className="text-lg font-semibold">Prepare records, track engines and understand costs</h3>
        <p><strong>Document inbox:</strong> choose Upload documents from Add, or open Documents → Document inbox. Upload PDFs or images once, retain the original, then review the suggested destination. Reading suggestions uses your AI allowance. Logbook pages enter the existing review queue; an invoice becomes a private expense only after approval, and oil reports show dated samples for review. Uploads waiting for connectivity stay on the device or browser that holds the original. Duplicate files are not added twice; likely duplicate pages wait for your decision.</p>
        <p><strong>Engine history:</strong> open Aircraft → Engine history to select an engine and installation or overhaul period. Compression readings retain their original reference pressure. Unassigned historical observations stay visible for review; twins are not automatically combined. Add reviewed observations and lifecycle events with source links where available.</p>
        <p><strong>Costs:</strong> the aircraft owner can record actual expenses and separate reserve estimates, import or export CSV, and link maintenance entries or supporting documents. See the <L href="#expense-csv">expense CSV column guide and template</L>. Financial access is separate from maintenance viewing or editing. Currency totals stay separate. Cost per hour uses the widest valid interval between verified readings inside your selected dates, including confirmed logbook entries and manually recorded or reviewed meter readings. It uses only expenses within those actual dates, which are shown with the meter and hours used. Readings must increase on the same meter without a replacement or reset; ADS-B estimates are excluded. For example, selecting Jan 1–Dec 31 with verified readings on Jan 13 and Dec 8 uses Jan 13–Dec 8 for the rate, while the total spending still covers Jan 1–Dec 31.</p>
        <p><strong>Annual packet:</strong> open Maintenance → Annual prep → Prepare annual packet. Download a PDF summary, or explicitly select the scans and documents to include in an evidence ZIP. Unreviewed information and missing records remain marked. The packet reflects current records; it is not an airworthiness determination or a maintenance sign-off.</p>
        <p>
          <strong>Documents</strong>{" "}keeps your AROW paperwork to hand, airworthiness certificate,
          registration, POH/AFM and weight &amp; balance, for a ramp check with no signal.{" "}
          <strong>PDFs open in the app</strong>, page by page, which matters because a registration
          or airworthiness certificate usually is one. Documents also go <em>in</em>{" "}from the phone, from Files, the camera, or by dragging a PDF onto an iPad, queued on the device
          with no signal, and attachable to the log entry they belong with.
        </p>
        <p>
          <strong>On an iPad</strong>, full screen, the app shows a sidebar and two panes: the verdict
          beside every tracked item, a page beside its entries, a squawk beside its detail. A Magic
          Keyboard drives it, ⌘1–6 for tabs, ⌘K for Ask, ⌘N for a new squawk, ⌘←/⌘→ to turn pages,
          ⌘↩ to confirm. In Split View below about half an iPad&apos;s width it falls back to the
          phone layout on purpose, so the app beside ForeFlight is the one you already know.
        </p>
        <p>
          <strong>Appearance</strong>{" "}in the account menu is Light, Dark, or Match my phone, and it
          repaints while the app is open. Your session lives in the <strong>iOS Keychain</strong>, so
          force-quitting, updating the build, or launching in airplane mode doesn&apos;t drop you at a
          sign-in screen you can&apos;t complete without signal. Signing out clears the device copy of
          your records with it.
        </p>
        <p>
          <strong>Adding an aircraft</strong>{" "}works from the phone: a tail number brings back make,
          model, serial and registrant from the FAA registry, and a tail the registry doesn&apos;t know
          can still be added by hand.
        </p>
        <Effects>
          Browse, check status, review pages, correct entries, manage inspections/ADs/equipment,
          resolve squawks and add documents, all offline, saved on the device and uploaded on the next
          sync. If someone changed the same row on the web meanwhile, the phone shows you both versions
          rather than picking a winner. Your account and aircraft are shared between the web and
          native app. Both stores offer the public release; no test invitation is needed.
        </Effects>
      </>
    ),
  },
  {
    id: "capture",
    title: "Capture & Upload",
    body: (
      <>
        <p>
          Two ways to get pages in, both landing in the same review queue:
        </p>
        <ul>
          <li>
            <strong>Capture</strong>: opens your phone&apos;s own camera app, so you get its
            autofocus, HDR and stabilisation, and the shot is instant. Fill the frame with the page;
            it doesn&apos;t need to be cropped or perfectly square, because the extractor reads the
            page out of the photo. Blurry or glare-heavy shots are flagged before you keep them.
            Got the desk in the shot? Open the page&apos;s review screen and use{" "}
            <strong>Crop &amp; clean up</strong>: drag the corners to cut out the background,
            rotate, and turn on the <strong>scan look</strong>{" "}for a black-and-white document finish.
            It <strong>replaces the stored scan</strong>{" "}(your paper page is still the legal record),
            so re-extract afterwards if the crop changed what&apos;s readable. On iPhone the app uses
            Apple&apos;s own document scanner and does this as you shoot.
          </li>
          <li>
            <strong>Upload scans</strong>: PDF, JPEG, or PNG. Multi-page PDFs are split into one
            page each, in order.
          </li>
        </ul>
        <p>
          Already have the history as data rather than paper? <L href="#csv-import">Import a CSV</L>{" "}
          instead, no scan needed.
        </p>
        <p>
          Uploaded a logbook out of order, the second volume before the first? Open that
          logbook under <L href="/hangar">your aircraft</L> → Logbooks → Pages, sort by <strong>Entry date</strong>,
          and hit <strong>Save this order</strong>. It renumbers that logbook&apos;s pages to match
          what you&apos;re looking at, in one step. (It only offers this once every page in the
          logbook has been extracted, before that there are no dates to order by.) The arrows in{" "}
          <strong>Reorder</strong>{" "}still nudge a single page up or down.
        </p>
        <p>
          Easiest way in: open <L href="/hangar">your aircraft</L> → Logbooks → Pages, tap the logbook you&apos;re
          about to scan, and use <strong>Capture into &lt;that logbook&gt;</strong>: the camera opens
          with it already selected, so there&apos;s no dropdown to get wrong.
        </p>
        <p>
          Pick the right <strong>logbook</strong>{" "}for what you&apos;re scanning, airframe/engine/
          prop/avionics for running maintenance pages, and <strong>Other</strong>{" "}for A&amp;P
          documents (see below). Pages queue on-device and upload when you&apos;re online, so
          capture works in a hangar with no signal.
        </p>
        <p>
          Note: scanned logbook spreads sometimes contain two physical pages side by side, the
          extractor flags these so you can review both halves.
        </p>
      </>
    ),
  },
  {
    id: "expense-csv",
    title: "Import expenses from CSV",
    body: (
      <>
        <p>
          As the aircraft owner, open <strong>Aircraft → Costs → Import expenses from CSV</strong>.
          <a href="/templates/expenses.csv" download="mytaillog-expenses-template.csv"> Download the expense CSV template</a>,
          open it in your spreadsheet editor, and add one expense or reserve estimate per row.
          Keep the header names and save as comma-separated CSV (UTF-8), then choose the file and import it.
          The template has no sample expenses to delete. Imports support up to 500 rows and 2 MB.
        </p>
        <h3 className="text-lg font-semibold">Required columns</h3>
        <dl>
          <dt><code>date</code></dt>
          <dd>The expense or reserve date, written as YYYY-MM-DD, for example 2026-11-25.</dd>
          <dt><code>currency</code></dt>
          <dd>An uppercase currency code: USD, CAD, EUR, GBP, AUD, NZD, CHF, JPY, CNY, HKD, SGD, INR, ZAR, SEK, NOK, DKK, AED, ILS, BRL, MXN, KWD, BHD or OMR. Currency totals stay separate; no conversion is applied.</dd>
          <dt><code>amount_minor</code></dt>
          <dd>A whole number in the currency’s smallest unit: USD 125.50 is 12550; JPY 125 is 125; KWD 1.250 is 1250. JPY uses no decimal places, KWD/BHD/OMR use three, and all other supported currencies use two. Do not include currency symbols, decimal points or thousands separators. Negative amounts record refunds; zero is not accepted.</dd>
          <dt><code>category</code></dt>
          <dd>What the expense is for. Use exactly one of: maintenance, fuel, oil, insurance, hangar, other.</dd>
          <dt><code>cost_type</code></dt>
          <dd>Use fixed for costs incurred regardless of flying, such as insurance or hangar rent; use variable for usage-related costs, such as fuel, oil or engine wear. Choose the classification appropriate to the expense: maintenance can be either.</dd>
          <dt><code>basis</code></dt>
          <dd>Use actual for actual spending, or reserve for a future cost allowance or estimate. The app totals these separately. A reserve amount is a total monetary amount, not an hourly rate that the importer multiplies by flight hours.</dd>
        </dl>
        <p>Use the category, cost_type and basis values exactly as shown, in lowercase. These are independent choices: an annual inspection can be maintenance/fixed/actual, while an engine overhaul allowance can be maintenance/variable/reserve.</p>
        <h3 className="text-lg font-semibold">Optional columns</h3>
        <dl>
          <dt><code>vendor</code></dt><dd>The supplier or business paid (up to 200 characters).</dd>
          <dt><code>payer</code></dt><dd>The person or organization that paid (up to 200 characters).</dd>
          <dt><code>notes</code></dt><dd>A description or other context (up to 4,000 characters).</dd>
          <dt><code>id</code></dt><dd>The expense’s MTL identifier (UUID). Omit for new expenses. Keep exported IDs when reimporting existing expenses. CSV import does not update an existing expense with different details; edit it in Costs instead.</dd>
          <dt><code>document_id</code></dt><dd>The UUID of an existing supporting document on this aircraft, not a filename.</dd>
          <dt><code>log_entry_id</code></dt><dd>The UUID of an existing logbook entry on this aircraft, not a page number.</dd>
        </dl>
        <p>The template includes vendor, payer and notes; leave them blank if unused. The identifier columns are optional advanced fields and can be added when needed. Export existing expenses to obtain their identifiers.</p>
        <h3 className="text-lg font-semibold">Examples</h3>
        <ul>
          <li>A $185.75 fuel purchase: amount_minor 18575, category fuel, cost_type variable, basis actual.</li>
          <li>$450 monthly hangar rent: amount_minor 45000, category hangar, cost_type fixed, basis actual.</li>
          <li>A $300 engine overhaul allowance: amount_minor 30000, category maintenance, cost_type variable, basis reserve.</li>
        </ul>
        <p>For these examples, use currency USD and the appropriate date. If a vendor or note contains a comma, let your spreadsheet editor quote the field when saving. The entire file must validate before anything is imported. Retrying the exact same file does not duplicate expenses; changing a file without expense IDs can create new records, so retain exported IDs when reimporting. If an existing ID has different details, the import is rejected; edit that expense in Costs instead.</p>
      </>
    ),
  },
  {
    id: "csv-import",
    title: "Import a CSV",
    body: (
      <>
        <p>
          Coming from another platform, or from your own spreadsheet? Export it as{" "}
          <strong>CSV</strong>{" "}and bring the maintenance history in directly, no printing to PDF,
          no re-typing. Up to <strong>5 MB / 5,000 rows</strong>{" "}per file; comma, semicolon and tab
          separated files all work, as do quoted fields containing commas or line breaks.
        </p>
        <p>
          We don&apos;t ship an importer per vendor. Instead, <strong>the columns are mapped, not
          the rows</strong>: one AI pass reads your header plus a few sample rows and proposes what
          each column means (&ldquo;Tach Out&rdquo; → Tach, &ldquo;A&amp;P&rdquo; → Signature,
          &ldquo;Invoice #&rdquo; → don&apos;t import). <strong>You confirm that mapping once</strong>,
          and every row is then converted in plain code, so the same file always imports the same
          way, and a wrong import is explainable by pointing at the mapping. Pick which{" "}
          <strong>logbook</strong>{" "}the file belongs to; a spreadsheet doesn&apos;t say.
        </p>
        <p>
          <strong>Dates are never guessed.</strong> <code>03/04/2026</code>{" "}
          is 3 April or 4 March depending on who exported it, and getting it wrong would shift a
          maintenance date by up to eleven months. We scan the whole date column: the first date
          anywhere in the file with a day past the 12th settles the reading for the entire file. Only
          if <em>every</em>{" "}row reads both ways are you asked, and you&apos;re shown what the first
          few dates become each way. A column that&apos;s internally inconsistent (some rows only
          day/month, others only month/day) is reported as a broken file rather than coerced.
        </p>
        <p>
          Before anything is written you get a <strong>count of what will be created</strong>, plus
          every row that can&apos;t be read and why, an unreadable date or an implausible tach
          fails that one row rather than importing as a zero, and never takes the rest of the file
          with it.
        </p>
        <Effects>
          Imported entries land <strong>unconfirmed</strong>: they show up in{" "}
          <L href="#extract">Review all</L>{" "}grouped as &ldquo;imported (no scan)&rdquo;, and drive
          no reminder or forecast until you confirm them. Importing into an aircraft that already
          has entries is the usual way to create duplicates, so check{" "}
          <L href="#duplicates">Fix duplicates</L>{" "}afterwards.
        </Effects>
      </>
    ),
  },
  {
    id: "extract",
    title: "Extraction & Review",
    body: (
      <>
        <p>
          Extraction reads a page image into structured entries (date, hours, work performed,
          parts, AD/SB references, signature). Each field gets its own confidence score, shown as a
          percentage right on that field in the <strong>Review</strong>{" "}screen, anything below
          threshold is highlighted. The page image sits alongside the entries, staying put as you
          scroll, so you can check a transcription against the original without opening anything.
          Tap the page mark beside a field to spotlight exactly where on the scan that
          value was read from (spotlights appear once a page is extracted under the current model;
          re-extract older pages to get them), and click the image itself to magnify it. Editing an
          entry marks it confirmed. The same review, the scan, the spotlight, the low-confidence
          chips, <strong>Confirm N clean</strong>{" "}and the page-spanning merge, now runs in the{" "}
          <L href="#mobile">mobile app</L>{" "}as well, offline, so a page can be checked against the
          paper book while the book is in your hands.
        </p>
        <p>
          <strong>Stickers at odd angles.</strong>{" "}Shops stick labels wherever there&apos;s room, so
          one page can carry an upright sticker and another rotated 90°. Each sticker is normally its
          own entry, and a page is read in every orientation. If rotated content is spotted but
          can&apos;t be read in full, the page gets a second look automatically, and if that still
          doesn&apos;t resolve it, <strong>Review shows a warning on that page</strong>{" "}asking
          you to compare against the paper. That matters more than a wrong value does: a low
          confidence score flags a field you can see, but an entry that was never extracted has
          nothing to flag. Use <strong>Add an entry the extractor missed</strong>{" "}to key it in. You can <strong>re-extract</strong>{" "}a page (e.g. if a multi-page
          entry wasn&apos;t linked) right from the review screen, it replaces that page&apos;s
          entries. The <strong>Logbook pages</strong>{" "}view lists every captured
          scan grouped by logbook with its <strong>Needs review / Processing</strong>{" "}status, and can
          be <strong>sorted</strong>{" "}within each logbook by upload order, entry date, tach, or{" "}
          <strong>AFTT</strong>, ascending or descending (the choice is remembered). Sorting
          reorders pages inside their own logbook, never across logbooks; the dates and hours come
          from a page&apos;s extracted entries, so an early logbook you uploaded late still sorts
          into chronological place. Pages in an <strong>airframe</strong>{" "}logbook are labelled{" "}
          <strong>AFTT</strong>{" "}(airframe total time), which is what an airframe book is kept in.
          Most airframe books don&apos;t record a separate airframe total, the tach is the
          instrument that total is kept in, so where none was written down, the page&apos;s tach
          reading is shown as its AFTT. Maintenance countdowns use the same reading, with a check
          first: if any entry recorded a total <em>and</em>{" "}a tach that disagree, the aircraft
          keeps those numbers apart on purpose and nothing is filled in, its airframe items then
          count down only on totals actually written down. Filter to a single
          logbook and hit <strong>Reorder</strong>{" "}to hand-arrange its pages with the ↑/↓ arrows, handy for scans captured out of order. The
          Logbooks <strong>Review</strong>{" "}shows how many pages still need attention.
        </p>
        <p>
          To move faster, <strong>Review all</strong>{" "}puts every
          extracted entry in one scrollable list, edit inline and confirm as you go, or hit{" "}
          <strong>Confirm N clean</strong>{" "}to accept, in one click, every entry the AI was fully
          confident on (high overall score, no flagged field, not a page-spanning fragment).
          Anything with a low-confidence field is left for you. Each page&apos;s scan sits beside
          its entries here too, so you can cross-reference the whole group without leaving the list;{" "}
          opening the page takes you to its own screen when you want to
          crop it, re-extract it, or read its raw transcription.
        </p>
        <Effects>
          Extracting a running-maintenance page also (best-effort) proposes{" "}
          <L href="#equipment">equipment</L>{" "}installs/removals and advances{" "}
          <L href="#maintenance">maintenance</L>{" "}last-done dates, so a single scan can shift your
          equipment list, the maintenance forecast, and the <L href="#status">Status</L>{" "}grid.
        </Effects>
      </>
    ),
  },
  {
    id: "duplicates",
    title: "Duplicates & fixes",
    body: (
      <>
        <p>
          Re-uploading, re-capturing, or re-extracting the same page can leave
          duplicate scans and entries behind. <strong>Duplicates &amp; fixes</strong>{" "}
          (editors only) flags likely duplicates by matching on
          date, tach/hobbs, and work text, grouping pages that look like the
          same scan and entries that look like the same logged event. One copy in
          each group is marked <strong>suggested keep</strong>; delete any of the
          others. Deleting a page also removes its entries. Matches are
          heuristic, so review each group against the source scan (each row has an{" "}
          <strong>Open</strong>{" "}link) before deleting.
        </p>
        <p>
          It also flags <strong>mis-keyed hobbs/tach readings</strong>: a value
          below an earlier reading (a dropped digit, e.g. <em>303</em>{" "}for{" "}
          <em>3,302</em>) or an unusually large jump (a fat-finger, e.g.{" "}
          <em>33,303</em>), and suggests the corrected number. <strong>Accept</strong>{" "}
          it, edit the value first, or <strong>Keep mine</strong>{" "}if it&apos;s
          right; either way it won&apos;t re-flag. This covers both log entries and
          MyFlightBook-synced readings. It also catches a <strong>Hobbs value that&apos;s
          just the Tach duplicated</strong>{" "}into both fields (they should differ), offering
          to <strong>Clear</strong>{" "}the bogus Hobbs while keeping the Tach.
        </p>
        <Effects>
          Deleting duplicate entries or pages updates your{" "}
          <L href="#extract">review</L>{" "}counts and the <L href="#timeline">timeline</L>;
          if a deleted entry drove a <L href="#maintenance">maintenance</L>{" "}last-done
          date or <L href="#status">status</L>{" "}item, re-scan or adjust as needed.
        </Effects>
      </>
    ),
  },
  {
    id: "other",
    title: 'The "Other" scan type (A&P documents)',
    body: (
      <>
        <p>
          Scan into the <strong>Other</strong>{" "}logbook for documents an A&amp;P shop produces that
          aren&apos;t running-log pages. MyTailLog classifies each and <em>applies</em>{" "}it instead
          of storing it as log entries:
        </p>
        <ul>
          <li>
            <strong>Weight &amp; Balance sheet</strong> → creates a new{" "}
            <L href="#wb">W&amp;B revision</L>{" "}(empty weight, CG, moment), which becomes your
            current W&amp;B.
          </li>
          <li>
            <strong>AD compliance report</strong> → treated as the <strong>ground truth</strong>{" "}
            for your AD state. It corroborates matching tracked ADs (they get a{" "}
            <em>&ldquo;✓ A&amp;P report&rdquo;</em>{" "}badge), and creates tracked records for ADs it
            lists that you weren&apos;t tracking yet.
          </li>
        </ul>
        <Effects>
          The AD report never overwrites a compliance record whose logbook-derived date is{" "}
          <em>newer</em>{" "}than the report, later logs win over the report baseline. A W&amp;B sheet
          updates your <L href="#wb">Weight &amp; Balance</L>; an AD report updates{" "}
          <L href="#compliance">AD tracking</L>{" "}and <L href="#status">Status</L>.
        </Effects>
      </>
    ),
  },
  {
    id: "timeline",
    title: "Logbooks and search",
    body: (
      <p>
        Every extracted entry across all logbooks appears on the Map and List. The List is date-ordered and
        filterable by logbook type. Full-text search finds work by keyword, part, or AD number
        (e.g. &ldquo;oil change&rdquo;, &ldquo;magneto&rdquo;, &ldquo;AD 2015-19-07&rdquo;). Each
        entry links back to its source page image. Choose <strong>Search or ask</strong>{" "}on the aircraft rail to search or ask a question.
      </p>
    ),
  },
  {
    id: "ask",
    title: "Ask your logbook",
    body: (
      <p>
        Ask plain-English questions (&ldquo;When was the last annual?&rdquo;, &ldquo;Hours since
        prop overhaul?&rdquo;). Answers are drawn <strong>only from confirmed entries</strong>{" "}
        and <strong>cite the specific entries</strong>{" "}they came from, so you can click through and
        verify. It won&apos;t invent facts the entries don&apos;t contain, but, like all AI, it can
        misread, so confirm anything you act on.
      </p>
    ),
  },
  {
    id: "status",
    title: "Status overview",
    body: (
      <>
        <p>
          Status opens with one sentence on what the confirmed records show. Below it, every recurring
          inspection, maintenance item and AD is listed with the days and hours remaining, plus, where
          there&apos;s enough flying history, <L href="#projection">an approximate calendar date</L>{" "}for
          the hours to run out. Each item carries a mark and a word:
        </p>
        <ul className="!list-none !pl-0">
          <li><StatusMark kind="current" />: nothing is due yet.</li>
          <li><StatusMark kind="due_soon" />: inside its warning window, usually 90 days or 10 hours.</li>
          <li><StatusMark kind="overdue" />: past its date or hours; the line says how long ago it lapsed.</li>
          <li><StatusMark kind="no_record" />: no confirmed entry shows it was ever done.</li>
        </ul>
        <p>
          Status rolls up your <L href="#maintenance">maintenance forecast</L>{" "}and recurring{" "}
          <L href="#compliance">ADs</L>; each item links to where you manage it. Entries read by AI
          don&apos;t count until you confirm them.
        </p>
      </>
    ),
  },
  {
    id: "maintenance",
    title: "Maintenance forecast",
    body: (
      <>
        <p>
          Tracks recurring Part 91 items (annual 91.409, transponder 91.413, pitot-static 91.411,
          ELT 91.207, VOR, 100-hour, oil, TBO, prop overhaul) and computes next-due from the
          interval and last-done. Seed the standard set with one click, mark items done, or add
          your own. Regulatory items are distinguished from advisory ones (TBO/overhaul).
        </p>
        <p>
          <strong>Calendar months, not exact months.</strong>{" "}The regulations that count in months, annual (91.409), transponder (91.413), pitot-static (91.411), ELT (91.207), say{" "}
          <em>&ldquo;within the preceding N calendar months&rdquo;</em>, so the day of the month the
          work was signed off doesn&apos;t matter: an annual completed anywhere in March 2025 is good
          through <strong>31 March 2026</strong>. Due dates for those items land on the last day of
          the month. Advisory items (prop overhaul) and the VOR check are <em>not</em>{" "}calendar-month
          rules, 91.171 is 30 days, so those count from the date itself.
        </p>
        <Effects>
          Each item counts down on the meter it&apos;s tracked against. By default that&apos;s the{" "}
          <strong>oil change</strong>{" "}on <strong>Hobbs</strong>{" "}(the meter you fly and record it
          on, so a fresh Hobbs reading from a MyFlightBook sync advances it directly), and
          everything else on the engine and airframe (<strong>100-hour, engine TBO, prop, ADs</strong>) on{" "}
          <strong>tach</strong>. Those are only defaults: every item has a{" "}
          <strong>&ldquo;Hours counted on&rdquo;</strong>{" "}setting, so if you track oil on the tach, or fly an aircraft with no Hobbs meter at all, set it there and the countdown follows.
          Aircraft with no Hobbs reading on record fall back to tach on their own rather than
          counting against a converted figure. When the needed meter has no recent reading, the
          other is converted via this aircraft&apos;s own hobbs↔tach ratio and marked{" "}
          <em>&ldquo;est.&rdquo;</em>, except <strong>airframe</strong>, which is never estimated.
          See <L href="#meters">Meters</L>.
          Extraction and{" "}
          &ldquo;Update from logs&rdquo; advance last-done automatically. The 100-hour resets off the
          later of the last 100-hour <em>or</em>{" "}the last annual. Hours-based items also show a{" "}
          <L href="#projection">projected ≈ date</L>{" "}when your reading history supports one.
          Everything here also feeds <L href="#status">Status</L>.
        </Effects>
      </>
    ),
  },
  {
    id: "projection",
    title: "Projected due dates (≈)",
    body: (
      <>
        <p>
          &ldquo;Due in 38.4 hours&rdquo; is accurate but hard to plan around. Wherever an item
          counts down on <em>hours</em>, MyTailLog also shows an approximate calendar date,{" "}
          <strong>≈ 14 Mar 2027</strong>, worked out from how much this aircraft has actually
          been flown, using your own logged meter readings from the past <strong>365 days</strong>.
        </p>
        <p>
          It is a <strong>planning estimate, not a determination</strong>. The hours figure is the
          thing that comes due; the date is only our arithmetic on a rate that can change the
          moment your flying does. Every projection carries the <strong>≈</strong>{" "}sign and a
          confidence level, and hovering it shows the rate and the exact readings it came from, so
          you can judge it yourself.
        </p>
        <p>
          <strong>Confidence</strong>{" "}reflects how much evidence sits behind the rate, both how
          many readings and how long a stretch they cover:
        </p>
        <ul>
          <li>
            <strong>High</strong>: 6+ readings spanning 180 days or more.
          </li>
          <li>
            <strong>Medium</strong>: 4+ readings over 90 days.
          </li>
          <li>
            <strong>Low</strong>: 2+ readings over 30 days. Treat as a rough sketch.
          </li>
          <li>
            <strong>None</strong>: anything thinner. No date is shown at all; you simply see the
            hours, exactly as before. MyTailLog will not guess a date from a single data point.
          </li>
        </ul>
        <p>
          The rate is measured on the <strong>tach</strong>{" "}wherever possible, because hour-based
          limits, the 100-hour, TBO, hour-interval ADs, are written against engine time. If your
          logs carry no usable tach history it falls back to <strong>hobbs</strong>{" "}and says so in
          the hover text. Hobbs runs a little faster than tach, so a hobbs-based projection tends
          to land slightly early, the safe direction to be wrong in.
        </p>
        <Effects>
          A projection <strong>never</strong>{" "}overrides a <strong>calendar</strong>{" "}limit. An annual
          is a date in its own right; the ≈ date only ever appears next to an <em>hours</em>{" "}
          countdown, and never replaces or softens a real due date. Intervals that span a recorded{" "}
          <L href="#meters">meter replacement</L>{" "}are dropped from the rate entirely, a swapped
          tach makes the raw difference meaningless, and that is the most likely source of a badly
          wrong date. Projections appear on <L href="#status">Status</L>, the{" "}
          <L href="#maintenance">maintenance forecast</L>, your <L href="#compliance">AD</L>{" "}rows,
          and in <L href="#notifications">reminder emails</L>. They are never used to decide{" "}
          <em>whether</em>{" "}something is due or when to email you, that stays on the real hours and
          dates.
        </Effects>
      </>
    ),
  },
  {
    id: "meters",
    title: "Meters, replacements & airframe time",
    body: (
      <>
        <p>
          <L href="/hangar">Aircraft → Hours and engine</L>{" "}shows what each instrument reads and
          lets you record two things the logbook alone can&apos;t express: a meter that was{" "}
          <strong>replaced</strong>, and <strong>airframe time</strong>.
        </p>
        <p>
          A hobbs or tach that gets swapped restarts near zero. Record the replacement, the date,
          the old meter&apos;s final reading, and what the new one started at, and MyTailLog stitches
          the two together into one continuous total. Without it, importing older logbook pages makes
          time appear to run backwards: the boundary reading gets flagged as a typo, and any item
          last done before the swap counts down against a number it can never reach. Both meters are
          handled the same way, and an aircraft can have more than one replacement on file.
        </p>
        <p>
          <strong>Airframe</strong>{" "}is a third, independent meter for sailplanes and motorgliders. A
          glider has no engine to drive a tach, and a motorglider accrues far more airframe time than
          engine time, so airframe is never derived from the other two, it shows only what has
          actually been recorded. Enter it on a logbook entry, at enrollment, or by hand on this page.
        </p>
        <p>
          <strong>Where a reading came from.</strong>{" "}Each current reading shows the date it is
          anchored to and its source, a logbook entry, a MyFlightBook sync, something you entered
          by hand, an ADS-B estimate, or the starting reading. A value marked <em>estimated</em>{" "}was
          derived rather than read off the meter, and the source then names what it was derived
          from. The readings list labels each row the same way, so an ADS-B estimate is never
          mistaken for a meter read.
        </p>
        <p>
          <strong>Starting readings</strong>{" "}on the same page are the figures captured when you added
          the aircraft. Every hours countdown starts from them, so a number typed into the wrong box
          shifts all of them, and they used to be set once at enrollment and unreachable afterwards.
          You can now edit them, and <strong>clearing a meter stops tracking it entirely</strong>: if
          you work from tach only, leave Hobbs blank and nothing will count against it. (The oil
          change is the one item that defaults to Hobbs; its{" "}
          <strong>&ldquo;Hours counted on&rdquo;</strong>{" "}setting switches it to tach.)
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
    id: "adsb",
    title: "ADS-B passive hours",
    body: (
      <>
        <p>
          If you don&apos;t log every flight, the recorded hours drift below the real ones and every
          countdown reads optimistic. <L href="/hangar">Aircraft → Hours and engine</L>{" "}can turn on a daily
          check against the <strong>OpenSky Network</strong>, a free community ADS-B feed, to notice
          that the aircraft flew when your records don&apos;t show it.
        </p>
        <p>
          It is <strong>off by default and opt-in per aircraft</strong>. The only thing that ever
          leaves the app is the aircraft&apos;s <strong>ICAO 24-bit Mode S address</strong>: public
          FAA registry data. Nothing about you or your records is sent, and no track or position
          data is stored: only the start, end and duration of each flight seen. Turn it off and the
          checks stop.
        </p>
        <p>
          The address is looked up from the FAA registry (or adsbdb as a fallback) and cached. It is
          never <em>computed</em>{" "}from your N-number, that encoding has edge cases that would
          silently pull another aircraft&apos;s flights. You can always enter it by hand.
        </p>
        <p>
          <strong>The check runs once a day, at 17:30 UTC</strong>{" "}(1:30 pm US Eastern in summer,
          12:30 pm in winter). So a flight this afternoon usually shows up tomorrow, not tonight.
          Each run looks back over the last three days, which means a run that fails or is skipped
          catches up by itself rather than losing those hours.
        </p>
        <p>
          <strong>Your own records always win.</strong>{" "}Hobbs and tach are cumulative, so a reading
          from a <L href="#myflightbook">MyFlightBook</L>{" "}sync, a logbook entry, or one you typed
          already accounts for everything flown up to its date. ADS-B only speaks up about flights{" "}
          <em>after</em>{" "}your most recent reading, and it stays quiet entirely if a meter was
          replaced since then.
        </p>
        <p>
          When it does speak up you get one line, &ldquo;3 flights totalling ≈4.2 h since your last
          reading&rdquo;, a suggested meter value, and two buttons: record a reading, or dismiss.{" "}
          <strong>Nothing is ever written for you.</strong>{" "}The suggested number is pre-filled and
          fully editable; read the real meter and correct it before saving.
        </p>
        <p>
          <strong>Honest limits.</strong>{" "}Airborne wall-clock is neither tach nor hobbs, it excludes
          taxi and runup and drifts from tach with RPM. Ground coverage has gaps. Not every GA
          aircraft broadcasts ADS-B Out. Treat it as an estimate that prompts a real reading.
        </p>
        <Effects>
          An accepted reading is saved as an <code>adsb_estimate</code>, which
          feeds the current-hours figure and the countdowns like any other reading, but is{" "}
          <strong>never</strong>{" "}compliance evidence, and never feeds a utilization-rate estimate
          (that would be circular). It may widen a forecast&apos;s warning band, which is the safe
          direction to be wrong in. Editors and owners can opt in and accept; viewers see it
          read-only.
        </Effects>
      </>
    ),
  },
  {
    id: "squawks",
    title: "Squawks",
    body: (
      <>
        <p>
          Track discrepancies noticed in flight, a rough mag, a sticky switch, a small leak. In{" "}
          <L href="/hangar">Maintenance → Squawks</L>, anyone with access to the aircraft (including a
          shared pilot) can report one with a severity; it stays <strong>open</strong>{" "}until an editor
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
    title: "Oil analysis",
    body: (
      <>
        <p>
          Owners periodically send an oil sample to a lab (Blackstone, AVLab, …) and get back a
          report of wear-metal concentrations. In{" "}
          <L href="/hangar">Aircraft → Oil</L>, click{" "}
          <strong>Import oil report</strong>{" "}and upload the lab&apos;s PDF (or a photo of it). The AI
          reads every sample in the report, dates, hours on the oil and engine, each element in
          parts per million, oil properties, and the lab&apos;s written comments.
        </p>
        <p>
          Each wear metal is charted over time against the lab&apos;s <strong>universal average</strong>{" "}
          for your engine type (the dashed line). Values above it are marked, and values well above it
          (2×) are marked more strongly. It is a prompt to watch, not a verdict.
        </p>
        <p>
          Separately, log each <strong>oil top-off</strong>{" "}(&ldquo;added 1.5 qt&rdquo;) with the
          tach/hobbs at the time, the meters prefill from the aircraft&apos;s current reading. From
          those, MyTailLog charts your <strong>burn rate</strong>{" "}(hours per quart) between top-offs, a leading indicator of engine health, distinct from the lab wear-metal trend above.
        </p>
        <p>
          Like all extraction here, the numbers are read by AI, confirm anything important against
          the original report, and treat the lab&apos;s own assessment as authoritative. Re-importing
          the same report updates its samples in place rather than duplicating them.
        </p>
      </>
    ),
  },
  {
    id: "myflightbook",
    title: "MyFlightBook (hours sync)",
    body: (
      <>
        <p>
          For the two-way connection, authorize MyTailLog in MyFlightBook&apos;s{" "}
          <strong>Preferences → Maintenance</strong>, then use <strong>Update from MyTailLog</strong>{" "}on
          its My Aircraft page. MyFlightBook can read your maintenance data and send recorded{" "}
          <strong>hobbs and tach</strong>{" "}back under that authorization. Check Meters here for a
          MyFlightBook reading; authorization alone does not confirm that hours have arrived.
        </p>
        <p>
          An older, optional pull is available under <L href="/account/settings">Account → MyFlightBook</L>.
          For that path, register your own OAuth app on MyFlightBook, save its client ID and secret
          here, connect, then use <strong>Sync from MyFlightBook</strong>. It matches aircraft by tail
          number and imports the latest recorded flight hours; the secret is stored encrypted.
        </p>
        <p>
          Honesty caveat: MyFlightBook has no authoritative &ldquo;current&rdquo; meter for a
          shared plane, and a flight&apos;s ending hours may go unlogged. So this is the latest{" "}
          <strong>recorded</strong>{" "}hobbs/tach, shown as <em>&ldquo;as of &lt;date&gt;&rdquo;</em>: treat it as the last known reading, not a live gauge, and confirm against the aircraft.
        </p>
        <Effects>
          A synced reading feeds <strong>current tach</strong>{" "}(reconciled across logs, enrollment,
          and synced readings, hobbs converted to tach when needed), so it flows straight into the{" "}
          <L href="#maintenance">maintenance forecast</L>, recurring{" "}
          <L href="#compliance">AD next-due</L>, and the <L href="#status">Status</L>{" "}grid.
        </Effects>
      </>
    ),
  },
  {
    id: "ai-key",
    title: "AI & your API key",
    body: (
      <>
        <p>
          Extraction and Q&amp;A run on the app&apos;s selected AI provider. By default they use the app&apos;s
          shared key, which has a <strong>daily allowance</strong>: about 50 pages in any 24 hours per
          person, within an overall cap on the shared key. When it is used up, reading waits until pages
          from 24 hours earlier roll off. To bill AI
          usage to your own account and get a much higher limit, add your own{" "}
          <strong>Anthropic or OpenAI API key</strong>{" "}in <L href="/account/settings">Account settings</L>. Your key is <strong>stored encrypted</strong>{" "}and never shown again; only the last
          four characters are kept for display.
        </p>
        <p>
          The app uses the stronger model for handwritten logbook pages, where a missed digit or
          maintenance entry matters. Printed pages, PDFs, and Ask My Logbook use the provider&apos;s
          lowest-cost capable model. Marking a captured page as printed or handwritten controls
          that routing; an unknown page takes the safer handwritten path.
        </p>
        <p>
          This must be an <strong>API key</strong>{" "}(starts with <code>sk-ant-</code>) from the{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            Anthropic Console
          </a>
          , where you add a little pay-as-you-go credit. A <strong>Claude.ai (Pro/Max) subscription
          won&apos;t work</strong>: it&apos;s a separate product with no API access.
        </p>
        <p>
          With your own key connected, the panel shows your <strong>usage</strong>: calls, input and
          output tokens, and <strong>estimated cost so far</strong>{" "}(from token counts at
          the provider&apos;s list prices; a close guide, not your exact invoice). If your key is
          rejected (invalid or out of quota) the request fails with a clear message, it is never
          silently charged to the shared key.
        </p>
      </>
    ),
  },
  {
    id: "notifications",
    title: "Notifications (email & push)",
    body: (
      <>
        <p>
          A daily background check emails you <strong>before</strong>{" "}maintenance, inspections, and
          ADs come due, and once they&apos;re overdue. Turn reminders on and tune the lead times in{" "}
          <L href="/account/settings">Account → Notifications</L>. The master switch is the on/off for{" "}
          <em>all</em>{" "}reminder email; below it, each category sets how far in advance you&apos;re
          warned:
        </p>
        <ul>
          <li>
            <strong>Annual inspection</strong>: a number of <em>days</em>{" "}before it&apos;s due
            (default 90).
          </li>
          <li>
            <strong>Oil change</strong>: a number of <em>hours</em>{" "}before it&apos;s due (default
            10).
          </li>
          <li>
            <strong>ADs / SBs</strong>{" "}and <strong>everything else</strong>: both a days-before and
            an hours-before window (defaults 30 days / 25 hours); whichever is reached first triggers
            the reminder.
          </li>
        </ul>
        <p>
          If you&apos;ve allowed notifications in the <L href="#mobile">mobile app</L>, the same daily
          check also sends a <strong>push notification</strong>{" "}to your phone, grouped per aircraft the
          way the digest is (&ldquo;N4321J, 2 items coming due&rdquo;). It follows the same lead times
          and the same once-per-due-cycle rule as the email, so you aren&apos;t told twice. Turning
          notifications off in the app removes that device.
        </p>
        <p>
          Reminders are grouped into <strong>one digest email per day</strong>, organized by
          aircraft, each item linking to its Status page. You&apos;re reminded once per due-cycle:
          after you mark an item done and it schedules a new next-due, the reminder arms again for the
          next cycle. You never get an empty email.
        </p>
        <p>
          Note: the oil-change <em>interval</em>{" "}(hours between changes) is set on the oil item on
          each aircraft&apos;s <L href="#maintenance">Maintenance</L>{" "}page, the setting here only
          controls how early you&apos;re alerted, not when the item is due.
        </p>
        <Effects>
          What counts as &ldquo;due&rdquo; comes straight from the{" "}
          <L href="#status">Status</L>{" "}grid, <strong>current tach</strong>{" "}(logs, enrollment, and{" "}
          <L href="#myflightbook">MyFlightBook</L>{" "}syncs, hobbs converted to tach when needed) and
          last-done dates drive it. The same
          daily job also auto-syncs connected MyFlightBook accounts once a day, so a reminder can
          reflect hours flown since you last opened the app.
        </Effects>
      </>
    ),
  },
  {
    id: "compliance",
    title: "AD and SB tracking",
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
          <strong>Explore</strong>{" "}searches for ADs you might not know about, three ways at once:
          by <strong>manufacturer</strong>{" "}(the airframe make plus every installed
          equipment&apos;s make, the broad net), by <strong>model</strong>{" "}(your specific
          variant, the sharp one), and by any <strong>keyword</strong>{" "}you type. Results come
          from the Federal Register plus the FAA&apos;s DRS, which is what surfaces the{" "}
          <strong>pre-1994 legacy ADs</strong>{" "}the Federal Register archive doesn&apos;t hold; if
          either source is unreachable the other still returns. Each result lists the{" "}
          <strong>models the AD names</strong>, with yours highlighted and those results sorted
          first, so you can see whether your variant is actually named instead of guessing from
          the make. <strong>Track this AD</strong>{" "}adds it in one click as a one-time item, or{" "}
          <em>Track with an interval</em>{" "}records it as recurring on hours, calendar months, or
          both, with a next-due.
        </p>
        <p>
          Search results are a starting point, not a determination. The parsed model list is read
          off the AD&apos;s title and summary and can be incomplete, real applicability often
          turns on serial numbers and installed equipment. Confirm against the AD itself; the call
          is yours and your A&amp;P&apos;s. For ground truth, scan an{" "}
          <L href="#other">A&amp;P AD compliance report</L>.
        </p>
        <Effects>
          Recurring ADs with a next-due join the <L href="#maintenance">forecast</L>{" "}and{" "}
          <L href="#status">Status</L>. Scanning an <L href="#other">A&amp;P AD report</L>{" "}
          corroborates records here and adds the &ldquo;✓ A&amp;P report&rdquo; badge.
        </Effects>
      </>
    ),
  },
  {
    id: "equipment",
    title: "Installed equipment",
    body: (
      <>
        <p>
          A reconstructed list of what&apos;s installed now, derived from your logs, installs and
          removals detected during extraction arrive as <strong>proposals</strong>{" "}you confirm or
          reject (nothing is trusted automatically). Use &ldquo;Update from logs&rdquo; to rescan
          the full history.
        </p>
        <Effects>
          An equipment install/removal that postdates your last{" "}
          <L href="#wb">Weight &amp; Balance</L>{" "}revision flags the W&amp;B as possibly stale, a
          common records gap (avionics swapped, W&amp;B never recomputed).
        </Effects>
      </>
    ),
  },
  {
    id: "wb",
    title: "Weight & Balance",
    body: (
      <>
        <p>
          A history of your W&amp;B revisions (empty weight, CG arm, moment) with the latest as your
          current W&amp;B, plus useful load if you enter max gross. Enter any two of
          weight/arm/moment and the third is filled in. This is an index of your W&amp;B records,
          not a loading calculator.
        </p>
        <Effects>
          If <L href="#equipment">equipment</L>{" "}changed after your last revision, a banner flags the
          W&amp;B as out of date. Scanning an <L href="#other">A&amp;P W&amp;B sheet</L>{" "}adds a
          revision automatically.
        </Effects>
      </>
    ),
  },
  {
    id: "records-vault",
    title: "Documents",
    body: (
      <>
        <p>
          A home for the aircraft&apos;s <strong>permanent records</strong>: airworthiness
          certificate, registration, radio station authorization, POH/AFM, weight &amp; balance,{" "}
          <strong>STCs</strong>, 337s, 8130-3s, ICAs, and manuals. In{" "}
          <L href="/hangar">your aircraft</L>, open Documents and upload a PDF or photo (up to 25 MB), tag it
          with a category and reference number, and it&apos;s a click away instead of buried in a
          binder. These sit alongside your logbook scans.
        </p>
        <p>
          A document can be <strong>linked to a maintenance entry</strong>. For example, the
          8130-3 for an installed part or the 337 for an alteration. The document stays in
          Documents when the link is removed; the linked entry also shows it in Logbooks.
        </p>
        <p>
          Editors can add, attach, detach, and remove documents; viewers can view and download them
          but cannot change any of it. Attachments travel in the .zip backup and survive a re-import.
        </p>
      </>
    ),
  },
  {
    id: "audit",
    title: "Records gap audit",
    body: (
      <p>
        Advisory heuristics that flag <em>suspected</em>{" "}gaps in the digitized record: missing
        annuals (breaks in the annual chain), long stretches with no entries, and recurring ADs
        never complied or past due. Framed as &ldquo;suspected&rdquo;, a gap may just mean a page
        isn&apos;t scanned yet. Find it under <strong>Maintenance → Annual</strong>, which also
        gathers what&apos;s due before the annual, open squawks for the shop, and pages still
        awaiting review.
      </p>
    ),
  },
  {
    id: "export",
    title: "Export & backup",
    body: (
      <>
        <p>
          Two PDFs, both produced by your browser&apos;s Print → Save as PDF (nothing to install).
          The <strong>maintenance summary</strong>{" "}is the one-page document you hand a buyer, an
          insurer, or your IA at annual: status at a glance, open squawks, the AD/SB compliance
          table, what&apos;s coming due, installed equipment, and current weight &amp; balance. The{" "}
          <strong>full records report</strong>{" "}is the same thing plus every transcribed logbook
          entry. You can also download CSVs of entries / AD-SB / equipment / maintenance.
        </p>
        <p>
          <strong>Share summary</strong>{" "}opens your device&apos;s normal share sheet with a compact
          text snapshot: status counts, due and overdue items, meter readings, and weight &amp;
          balance. It deliberately leaves out scans, serial numbers, reporter names, and squawk
          descriptions. On browsers without a share sheet, the same snapshot is copied to the
          clipboard. Use Print → Save as PDF when the recipient needs the full report.
        </p>
        <p>
          The <strong>.zip backup</strong>{" "}takes everything, all records plus your original
          scans, and includes a <code>README.txt</code>{" "}
          documenting every file and every column, so the archive still explains itself years
          from now.
        </p>
        <p>
          <strong>Automatic cloud backups.</strong>{" "}Connect <strong>Dropbox</strong>{" "}and/or{" "}
          <strong>Google Drive</strong>{" "}from <L href="/account/settings">Account settings</L>{" "}and that same .zip is
          pushed to your own account <strong>monthly or quarterly</strong>, one file per aircraft,
          named <code>&lt;TAIL&gt;/&lt;date&gt;-&lt;TAIL&gt;.zip</code>.
          On Drive that sits inside a <code>MyTailLog</code>{" "}folder;
          on Dropbox the app folder is already that folder, so there&apos;s no second one.
          You can connect <em>both</em>: each has its own schedule and runs independently, which is
          real redundancy rather than one basket. We can only ever see the files we put there, never
          the rest of your account: Dropbox gives us an <em>app folder</em>, and on Google Drive we
          ask only for permission to touch <em>files this app creates</em>, so your existing Drive is
          invisible to us by construction rather than by promise. We only ever <em>add</em>{" "}files, nothing in your account is renamed, replaced or deleted, so retention stays your call.
          Account settings shows each destination&apos;s last run, its result and its size, and emails you if
          two runs in a row fail. Very large aircraft (hundreds of scanned pages) are reported as{" "}
          <em>too large to upload</em>{" "}rather than silently failing, download those by hand.
        </p>
        <p>
          <strong>On lock-in.</strong>{" "}That .zip <strong>re-imports</strong>: restoring it
          recreates the aircraft, entries, ADs and scans as a <em>new</em>{" "}aircraft (it never
          overwrites an existing one). Everything inside is plain JSON and your original
          JPEG/PNG/PDF files, readable with no special software. MyTailLog itself is{" "}
          <a
            href="https://github.com/iiamit/MyTailLog"
          >
            open source under the MIT licence
          </a>{" "}
          and can be self-hosted against your own database, so leaving is always an option you
          actually have.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Sharing, record rooms, transfer and delete",
    body: (
      <>
      <p>
        Invite others by email as <strong>viewers</strong>{" "}(read-only) or <strong>editors</strong>{" "}
        (can contribute), they get access the moment they sign in with that address, no account
        needed first. Owners can transfer an aircraft to another user, or delete it (type-to-confirm;
        removes all records and scans). Access is enforced by the database, not just the UI.
      </p>
      <p>
        <strong>Record room links</strong>{" "}give a buyer, mechanic, IA or insurer read-only access with
        no account. You pick what&apos;s in each link: the maintenance summary, whole logbooks (only
        entries you&apos;ve confirmed are shown), their page scans, and individual documents.
        Links expire after 7 to 180 days, you can revoke one at any time, and the list shows how many
        times each was opened. Transferring the aircraft revokes every link. Create one under Share,
        or from the pre-buy dossier with &ldquo;Share with a buyer&rdquo;.
      </p>
      </>
    ),
  },
  {
    id: "profile",
    title: "Account & sign-in",
    body: (
      <>
        <p>
          On the website, <L href="/login">sign in or create an account</L>{" "}with Google, Apple,
          an email magic link, or email and password. The Android app offers Google sign-in;
          the iPhone app also offers Apple sign-in once its updated build is installed. Email
          sign-in remains available in both apps.
        </p>
        <p>
          <strong>Already have aircraft here?</strong>{" "}Sign in with your original email method
          first. On the web, open <L href="/account/settings">Account → How you sign in</L>{" "}and choose{" "}
          <strong>Connect</strong>{" "}beside Google or Apple. In an updated mobile app, open{" "}
          <strong>Account → Connect Google/Apple sign-in</strong>. Complete the provider prompt
          and return to MyTailLog. When it says <strong>Connected</strong>, that method opens your
          existing account with the same aircraft and records. This also works if Apple hides
          your email or your provider uses a different address.
        </p>
        <p>
          If you started a separate account by mistake, sign out and return to the account
          that already has your aircraft before connecting a provider. Connecting a sign-in
          method does not merge two accounts. You can still use your original magic link or
          password afterward. To reset a password, enter your email on the sign-in page,
          choose <strong>Password → Forgot password?</strong>, then follow the email link.
          In Account settings you can also set or change a password, change your email, and manage
          your name, A&amp;P/IA certificate number, and <L href="#notifications">notifications</L>.
        </p>
      </>
    ),
  },
  {
    id: "developer-api",
    title: "Developer API (OAuth)",
    body: (
      <p>
        Other apps (like MyFlightBook) can read your aircraft&apos;s maintenance status, equipment, hours,
        oil, and weight-and-balance data, <strong>only with your consent</strong>. An app granted{" "}
        <strong>hours:write</strong>{" "}can also add Hobbs and tach readings. On the consent screen you choose
        the scope: <strong>all your
        aircraft</strong>{" "}(the default, including any you add later, so an app keeps working as your
        fleet grows) or <strong>only the ones you pick</strong>. A brand-new account can authorize an
        app before adding any aircraft, the app just sees an empty list until you add one. Revoke any
        app anytime under <L href="/account/settings">Account → Connected apps</L>. Building an integration?
        Register an app and read the guide under <L href="/developers">Developer API</L>. Your
        transcribed log entries are never shared.
      </p>
    ),
  },
];

// Eight groups for the contents list, in the app's own order: start, then the six sections, then the account.
const GROUPS: { id: string; title: string; topics: string[] }[] = [
  { id: "g-start", title: "Start here", topics: ["idea", "designs", "start", "mobile"] },
  { id: "g-logbooks", title: "Logbooks", topics: ["capture", "csv-import", "extract", "duplicates", "other", "timeline", "ask", "audit"] },
  { id: "g-status", title: "Status", topics: ["status", "maintenance", "projection"] },
  { id: "g-maintenance", title: "Maintenance", topics: ["squawks", "compliance", "oil-analysis"] },
  { id: "g-aircraft", title: "Aircraft", topics: ["meters", "adsb", "myflightbook", "equipment", "wb", "expense-csv"] },
  { id: "g-documents", title: "Documents", topics: ["records-vault"] },
  { id: "g-share", title: "Share", topics: ["sharing", "export", "developer-api"] },
  { id: "g-account", title: "Account and settings", topics: ["profile", "ai-key", "notifications"] },
];

const BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

export default function HelpPage() {
  return (
    <InformationShell
      group="help"
      path="/help"
      title="Help"
      lede={
        <p>
          What every part of MyTailLog does, and how one part affects another. Cost, privacy and getting your data out
          are in the <L href="/faq">FAQ</L>; what changed lately is in <L href="/whats-new">What&apos;s new</L>.
        </p>
      }
      toc={GROUPS.map((g) => ({ id: g.id, title: g.title }))}
    >
      {GROUPS.map((g, gi) => (
        <ReadSection key={g.id} id={g.id} title={g.title} first={gi === 0}>
          {g.topics.map((id) => {
            const t = BY_ID.get(id)!;
            return (
              <div key={id} className="[&+&]:mt-8">
                <h3 id={t.id} className="scroll-mt-4">{t.title}</h3>
                {t.body}
              </div>
            );
          })}
        </ReadSection>
      ))}
    </InformationShell>
  );
}
