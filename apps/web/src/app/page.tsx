import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";
import shotReview from "../screenshots/review.png";
import shotStatus from "../screenshots/status.png";
import shotAsk from "../screenshots/ask.png";
import shotTimeline from "../screenshots/timeline.png";
import shotHub from "../screenshots/hub.png";
import shotWb from "../screenshots/wb.png";

/*
  Landing page — deliberately NOT wrapped in MarketingShell.
  MarketingShell is a 45rem prose column built for the spoke pages (/faq,
  /compare, /switch/myfbo) and its footer nav lists "Home", i.e. this page.
  This page is the hub, and it is carrying 16:9 product screenshots that die
  at a 45rem measure. So it keeps its own full-width frame and its own top bar
  (AppHeader renders nothing on "/"), but reuses the shell's footer pattern —
  link row + the 91.417 line — so the family still reads as one site.
*/

const CONTAINER = "mx-auto w-full max-w-6xl px-5 sm:px-7";
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** A datum: tail number, tach reading, AD number, date. Mono, inline in prose. */
function D({ children }: { children: React.ReactNode }) {
  // nowrap: an AD number broken across two lines stops reading as one datum.
  return (
    <span className="readout whitespace-nowrap text-[0.92em] text-ink">{children}</span>
  );
}

// The record's life, in order — the spine of the page. Order carries meaning
// here (you cannot ask a logbook a question before it has been read), which is
// why the sections are a sequence and not a grid of equals.
const STAGES: {
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  src: StaticImageData;
  alt: string;
  caption: string;
}[] = [
  {
    eyebrow: "What's due",
    title: "Then it starts telling you things",
    body: (
      <>
        <p>
          Every inspection, recurring item and AD on one grid, coloured by how
          close it is. Part 91 recurring items are tracked on hours{" "}
          <em>and</em> on the calendar, and an hours countdown is projected onto
          a date from how much you actually fly — so &ldquo;due in{" "}
          <D>38.4</D> hours&rdquo; also reads as a month you can plan around.
          Every projection is marked <D>≈</D>, carries a confidence drawn from
          how much reading history backs it, and never overrides a real calendar
          limit.
        </p>
        <p>
          AD and SB compliance carries an official FAA reference lookup — the
          Federal Register for anything post-1994, with a DRS fallback for the
          legacy ones — and AD discovery searches by manufacturer, model or
          keyword, listing the models each AD names with yours highlighted.
        </p>
        <p>
          Email reminders go out before things come due, with a lead time you
          set per item.
        </p>
      </>
    ),
    src: shotStatus,
    alt: "The Status grid: inspections, maintenance items and airworthiness directives listed by urgency, each with hours and dates remaining",
    caption: "Status — everything due, ordered by how close it is.",
  },
  {
    eyebrow: "Ask it",
    title: "Questions, not file names",
    body: (
      <>
        <p>
          Ask in plain English — <em>when was the vacuum pump last replaced</em>,{" "}
          <em>has the seat rail AD ever been done</em> — and the answer arrives
          with the entries it came from cited underneath, so you can check the
          reasoning against the scan rather than trust it.
        </p>
        <p>
          The same reading builds an installed-equipment list from what the logs
          say went in and came out, and a records-gap audit that points at the
          stretches where the book simply skips.
        </p>
      </>
    ),
    src: shotAsk,
    alt: "Ask your logbook: a plain-English question answered in a paragraph, with the source log entries listed below it",
    caption: "Ask — answers that cite the entries they came from.",
  },
  {
    eyebrow: "Find it",
    title: "One timeline across every book",
    body: (
      <>
        <p>
          Airframe, engine, prop, avionics and a catch-all &ldquo;other&rdquo;
          book, merged into a single searchable timeline. Search the work text,
          filter by book, jump to the scan the entry was read from.
        </p>
        <p>
          Duplicate detection flags likely repeats by date, tach/hobbs and work
          text, so re-captures and re-extractions don&apos;t quietly pile up —
          and hobbs and tach readings are reconciled against each other rather
          than averaged into a number that flatters your hours.
        </p>
      </>
    ),
    src: shotTimeline,
    alt: "Timeline and search: log entries from every logbook merged into one chronological list with a search field and per-book filters",
    caption: "Timeline — every book, one chronology, searchable.",
  },
  {
    eyebrow: "Keep it",
    title: "The documents, not just the entries",
    body: (
      <>
        <p>
          Weight &amp; balance is kept as a revision history with the current
          empty weight and CG on top, flagged stale when equipment changed after
          the last revision. Scan a new W&amp;B sheet and it files itself as the
          next revision; scan an A&amp;P&apos;s AD compliance report and it
          becomes the ground truth for your AD state.
        </p>
        <p>
          The Records Vault holds the permanent paperwork beside the logbook
          scans — airworthiness certificate, registration, radio station
          authorization, POH/AFM, STCs, 337s, 8130-3s, manuals.
        </p>
      </>
    ),
    src: shotWb,
    alt: "Weight and balance: current empty weight, CG and useful load above a list of dated W&B revisions",
    caption: "Weight & balance — current figures over the full revision history.",
  },
  {
    eyebrow: "Per aircraft",
    title: "And one place it all lands",
    body: (
      <>
        <p>
          Each aircraft gets its own view: status, hours, open squawks, oil
          trend, what&apos;s next. Squawks are reported by anyone with access —
          including a pilot you&apos;ve shared the aircraft with — carry a
          severity and a reporter, and stay open until an editor resolves them.
        </p>
        <p>
          Share an aircraft as viewer or editor, transfer ownership, or delete
          it. Everything is scoped by Postgres row-level security rather than
          application code, through a single access check every table routes
          through.
        </p>
      </>
    ),
    src: shotHub,
    alt: "Aircraft overview: hours, next due items, open squawks and recent activity for a single aircraft",
    caption: "One overview per aircraft, colour-coded by what needs attention.",
  },
];

// Roughly everything it does. Grouped, one line each, no icons — the product
// is an index, so the breadth is presented as an index.
const INDEX: { group: string; items: React.ReactNode[] }[] = [
  {
    group: "Capture & extract",
    items: [
      "Capture with your phone's own camera — or upload PDF, JPEG, PNG",
      "Pages queue on the device with no signal and upload when you're back",
      "Five logbook types: airframe, engine, prop, avionics, other",
      "Per-field confidence scores; low-confidence fields are held back from bulk-confirm",
      <>
        CSV import — one AI pass maps your <em>columns</em>, then every row
        converts in plain code. CSV only, up to <D>5 MB</D> / <D>5,000</D> rows,
        maintenance entries
      </>,
      "Duplicate finder across scans and entries",
      "Scan a W&B sheet or an AD compliance report and it applies itself",
    ],
  },
  {
    group: "Track & forecast",
    items: [
      "Status grid, coloured by urgency",
      <>
        Part 91 recurring items on hours and on the calendar, with an{" "}
        <D>≈</D> projected date and a confidence
      </>,
      "AD/SB compliance with FAA reference lookup (Federal Register, DRS fallback)",
      "AD discovery by manufacturer, model or keyword",
      "Installed equipment rebuilt from the logs",
      "Weight & balance revisions, flagged stale after an equipment change",
      "Records gap audit",
      "Squawks — anyone with access reports, an editor resolves",
      "Email reminders with your own lead time per item",
    ],
  },
  {
    group: "Hours & engine health",
    items: [
      "Hobbs↔tach reconciliation, so an inflated hobbs doesn't drive your forecast",
      "MyFlightBook sync pulls your latest hobbs/tach once a day",
      <>
        ADS-B passive hours — opt-in per aircraft, off by default; it only ever{" "}
        <em>suggests</em> a meter value, never writes one
      </>,
      "Oil analysis — a lab report in, wear metals charted against the lab's universal average",
      "Oil consumption — hours per quart between top-offs",
      "Bring your own Anthropic API key to bill AI usage to your own account",
    ],
  },
  {
    group: "Keep it & leave with it",
    items: [
      "Records Vault for the permanent paperwork",
      "A printable maintenance summary — the page you hand a buyer, an insurer or an IA",
      "A full .zip backup of every row as JSON plus the original scans, re-importable",
      "Automatic backups to your own Dropbox and/or Google Drive, monthly or quarterly",
      "Sharing (viewer / editor), ownership transfer, delete",
      <>
        A read-only OAuth 2.1 API and a self-serve{" "}
        <Link href="/developers/docs" className={`underline decoration-line underline-offset-2 hover:decoration-line2 ${FOCUS}`}>
          developer portal
        </Link>
      </>,
      "An iOS app in TestFlight beta that browses everything offline",
      "MIT licence — run the whole thing yourself",
    ],
  },
];

const NAV: { href: string; label: string }[] = [
  { href: "/faq", label: "FAQ" },
  { href: "/compare", label: "How it compares" },
  { href: "/switch/myfbo", label: "Coming from MyFBO" },
  { href: "/help", label: "Help & docs" },
  { href: "/developers/docs", label: "API" },
  { href: "/whats-new", label: "What's new" },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const primary = user
    ? { href: "/dashboard", label: "Go to your hangar" }
    : { href: "/login", label: "Create your account" };

  return (
    <>
      {/* This page renders no AppHeader (PUBLIC includes "/"), so it carries
          its own bar — and it has to work signed in as well as signed out. */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className={`${CONTAINER} flex h-[60px] items-center justify-between gap-4`}>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-[22px] w-[22px]"
              style={{
                background: "linear-gradient(180deg,var(--accent),#8ec8ff)",
                clipPath: "polygon(50% 0,100% 86%,0 86%)",
              }}
            />
            <span className="font-display text-[17px] font-bold tracking-[0.2px]">
              MyTailLog
            </span>
          </div>

          <nav aria-label="Site" className="hidden items-center gap-1 lg:flex">
            {NAV.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-2.5 py-2 text-[13px] text-dim hover:bg-panel hover:text-ink ${FOCUS}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {!user && (
              <Link
                href="/login"
                className={`hidden rounded-md px-3 py-2 text-[13px] text-dim hover:text-ink sm:inline ${FOCUS}`}
              >
                Sign in
              </Link>
            )}
            <Link
              href={primary.href}
              className={`rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-bg hover:opacity-90 ${FOCUS}`}
            >
              {primary.label}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className={`${CONTAINER} animate-up pb-14 pt-14 sm:pt-20`}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
            <div className="max-w-[46rem]">
              <p className="eyebrow mb-4">
                Aircraft logbook digitizer &amp; maintenance tracker
              </p>
              <h1 className="font-display text-[clamp(2.05rem,5.4vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-balance">
                Your annual is in three weeks. The logbooks are a cardboard box.
              </h1>

              <div className="mt-6 flex flex-col gap-4 text-[17px] leading-relaxed text-dim">
                <p>
                  Photograph the pages, or upload the scans you already have. A
                  vision model reads each one into a structured entry — the date{" "}
                  <D>1979-04-12</D>, tach <D>2214.7</D>, the work performed, the
                  parts, <D>AD 79-08-03</D>, the signing mechanic and
                  certificate number — scores its own confidence field by field,
                  and puts the result beside the original page for you to
                  confirm.
                </p>
                <p>
                  Minutes per page plus your review time, and nobody else ever
                  handles your books. The other way to get decades of paper into
                  data is to mail them to a transcription service, wait days to
                  weeks, and pay in the hundreds per aircraft.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href={primary.href}
                  className={`rounded-md bg-accent px-5 py-3 font-medium text-bg hover:opacity-90 ${FOCUS}`}
                >
                  {primary.label} →
                </Link>
                {user ? (
                  <Link
                    href="/help"
                    className={`rounded-md border border-line px-5 py-3 text-dim hover:border-line2 hover:text-ink ${FOCUS}`}
                  >
                    Help &amp; documentation
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className={`rounded-md border border-line px-5 py-3 text-dim hover:border-line2 hover:text-ink ${FOCUS}`}
                  >
                    Sign in
                  </Link>
                )}
              </div>

              {!user && (
                <p className="mt-4 text-[13.5px] text-faint">
                  Email link or a password — one page, no card, nothing to
                  cancel. Every new account already has a demo aircraft in it
                  (<D>N734DM</D>, a fictional 1978 Cessna 172N with decades of
                  history), so there is something to poke at before you scan
                  anything of your own.
                </p>
              )}
            </div>

            {/* The one place the page raises its voice: the price, as a gauge. */}
            <aside className="lg:pt-10">
              <div className="panel-raised p-5">
                <div className="eyebrow">Cost to you, per month</div>
                <div className="readout mt-2 text-[44px] font-semibold leading-none text-annun-green">
                  $0.00
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-annun-green"
                  />
                  <span className="readout text-[10.5px] uppercase tracking-[0.12em] text-dim">
                    No billing code in the app
                  </span>
                </div>

                <dl className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-[12.5px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-faint">Licence</dt>
                    <dd className="readout text-ink">MIT</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-faint">Self-hostable</dt>
                    <dd className="readout text-ink">YES</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-faint">Trial clock</dt>
                    <dd className="readout text-ink">NONE</dd>
                  </div>
                </dl>

                <p className="mt-4 text-[12.5px] leading-relaxed text-faint">
                  No plans, no tiers, no card field.{" "}
                  <a
                    href="https://github.com/iiamit/MyTailLog"
                    className={`underline decoration-line underline-offset-2 hover:decoration-line2 ${FOCUS}`}
                  >
                    The source is public
                  </a>
                  , so that is checkable rather than promised.
                </p>
              </div>
            </aside>
          </div>
        </section>

        {/* ── The hero shot: the thing that actually differs ──────────── */}
        <section className={`${CONTAINER} pb-16`}>
          <figure className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-lg border border-line bg-panel2">
              <Image
                src={shotReview}
                alt="The review screen: a handwritten 1979 logbook page on the left, the extracted entry on the right with a confidence percentage beside each field and the uncertain ones flagged"
                sizes="(max-width: 1200px) 100vw, 1100px"
                placeholder="blur"
                priority
                className="h-auto w-full"
              />
            </div>
            <figcaption className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-faint">
              <span className="eyebrow">Capture &amp; read</span>
              <span>
                The page as written, beside what the model read — with a
                confidence score on every field and the shaky ones flagged for
                you.
              </span>
            </figcaption>
          </figure>
        </section>

        {/* ── The spine: what happens to a record after it's captured ─── */}
        <div className="flex flex-col">
          {STAGES.map((s) => (
            <section
              key={s.eyebrow}
              className="border-t border-line py-14 sm:py-16"
            >
              {/*
                These are ~3200x1800 captures of dense UI. In a half-column
                (~518 CSS px) every one of them except the review shot rendered
                as a dark smudge — the problem is how much interface is in
                frame, not only the pixel count. So the prose runs as a
                two-column band and the screenshot gets the full container
                width, which is the ~1100px the review shot is already legible
                at. `sizes` states that real slot width so the browser can pick
                a 2x candidate on a retina display.
              */}
              <div className={`${CONTAINER} flex flex-col gap-8`}>
                <div className="grid gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                  <div>
                    <p className="eyebrow mb-3">{s.eyebrow}</p>
                    <h2 className="font-display text-[clamp(1.4rem,3vw,1.9rem)] font-semibold leading-tight text-balance">
                      {s.title}
                    </h2>
                  </div>
                  <div className="flex max-w-[44rem] flex-col gap-3 leading-relaxed text-dim">
                    {s.body}
                  </div>
                </div>

                <figure className="flex min-w-0 flex-col gap-2">
                  <div className="overflow-hidden rounded-lg border border-line bg-panel2">
                    <Image
                      src={s.src}
                      alt={s.alt}
                      sizes="(max-width: 1200px) 100vw, 1100px"
                      placeholder="blur"
                      className="h-auto w-full"
                    />
                  </div>
                  <figcaption className="text-[12.5px] text-faint">
                    {s.caption}
                  </figcaption>
                </figure>
              </div>
            </section>
          ))}
        </div>

        {/* ── Free, restated with the weight it deserves ──────────────── */}
        <section className="border-t border-line py-16">
          <div className={CONTAINER}>
            <p className="eyebrow mb-3">Why it is free</p>
            <h2 className="max-w-3xl font-display text-[clamp(1.5rem,3.2vw,2.1rem)] font-semibold leading-tight text-balance">
              Free is a fact about the code, not a promise about next year
            </h2>
            <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-14">
              <div className="flex max-w-[38rem] flex-col gap-4 leading-relaxed text-dim">
                <p>
                  There is no billing in MyTailLog at all — no plans, no tiers,
                  no trial clock, no card field, no payment code anywhere in the
                  app. The repository is public and MIT-licensed, so that is not
                  a claim you have to take on trust; it is a thing you can go
                  and check.
                </p>
                <p>
                  It also means the exit is real. Everything you put in comes
                  back out as a <D>.zip</D> of every row as JSON plus the
                  original scans, re-importable into any instance — including
                  one you run yourself, on your own Supabase and your own
                  Anthropic key. Portability that survives us losing interest is
                  a stronger promise than portability that depends on us staying
                  nice.
                </p>
              </div>
              <div className="flex max-w-[38rem] flex-col gap-4 leading-relaxed text-dim">
                <p>
                  The one line item that costs real money is the AI. Reading a
                  logbook page is a vision-model call, billed to whoever&apos;s
                  key is used — so shared use is capped two ways, a per-person
                  daily call limit and an overall daily-dollar ceiling. If the
                  day&apos;s shared budget runs out, extraction pauses until
                  tomorrow and everything else keeps working.
                </p>
                <p>
                  Add your own Anthropic key in Profile and the calls bill to
                  your account at list prices, with a much higher limit. The
                  numbers, and everything else about cost and privacy, are in
                  the{" "}
                  <Link
                    href="/faq"
                    className={`underline decoration-line underline-offset-2 hover:decoration-line2 ${FOCUS}`}
                  >
                    FAQ
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── The index: roughly everything, one line each ────────────── */}
        <section className="border-t border-line py-16">
          <div className={CONTAINER}>
            <p className="eyebrow mb-3">The rest of it</p>
            <h2 className="max-w-3xl font-display text-[clamp(1.5rem,3.2vw,2.1rem)] font-semibold leading-tight text-balance">
              Everything else it does
            </h2>
            <div className="mt-8 grid gap-x-12 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
              {INDEX.map((g) => (
                <div key={g.group} className="min-w-0">
                  <h3 className="border-b border-line pb-2 font-display text-[15px] font-semibold text-ink">
                    {g.group}
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2.5 text-[13.5px] leading-relaxed text-dim">
                    {g.items.map((item, n) => (
                      <li key={n}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── What it doesn't do. The other pages do this; it's why they
              read as credible. ───────────────────────────────────────── */}
        <section className="border-t border-line py-16">
          <div className={CONTAINER}>
            <p className="eyebrow mb-3">Limits</p>
            <h2 className="max-w-3xl font-display text-[clamp(1.5rem,3.2vw,2.1rem)] font-semibold leading-tight text-balance">
              What it doesn&apos;t do
            </h2>
            <dl className="mt-8 grid max-w-5xl gap-x-12 gap-y-7 md:grid-cols-2">
              <div>
                <dt className="font-medium text-ink">
                  No accuracy percentage, because nothing here measures one
                </dt>
                <dd className="mt-1.5 text-[14px] leading-relaxed text-dim">
                  What you get instead is a confidence score per field, the scan
                  beside the entry, and the flagged fields held back from
                  bulk-confirm. That catches what the model knows it is unsure
                  of. It cannot catch what the model was confidently wrong
                  about — your review is what closes that gap, and it is real
                  work.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink">
                  No scheduling, dispatch, invoicing or billing
                </dt>
                <dd className="mt-1.5 text-[14px] leading-relaxed text-dim">
                  Deliberately out of scope, not a roadmap item. Same for
                  eSignatures, parts inventory, work orders and multi-fleet MRO
                  management. If you need a booking calendar and rental rates,
                  an ops platform does that and this does not.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink">
                  Mobile is a beta, and iOS only
                </dt>
                <dd className="mt-1.5 text-[14px] leading-relaxed text-dim">
                  The native app is in TestFlight. It browses every entry,
                  document and scan fully offline and captures pages offline,
                  but editing existing entries is still done on the web, and
                  there is no Android app.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink">
                  CSV import is CSV, and it is maintenance entries
                </dt>
                <dd className="mt-1.5 text-[14px] leading-relaxed text-dim">
                  Not XLSX — save it as CSV first, which is one step. Up to{" "}
                  <D>5 MB</D> and <D>5,000</D> rows, creating log entries only,
                  and everything imported lands unconfirmed until you have
                  reviewed it.
                </dd>
              </div>
            </dl>

            <div className="mt-9 max-w-3xl">
              <Disclaimer />
            </div>
          </div>
        </section>

        {/* ── Close ──────────────────────────────────────────────────── */}
        <section className="border-t border-line py-16">
          <div className={`${CONTAINER} flex flex-col items-start gap-6`}>
            <h2 className="max-w-2xl font-display text-[clamp(1.5rem,3.2vw,2.1rem)] font-semibold leading-tight text-balance">
              {user
                ? "Your aircraft are where you left them"
                : "Start with one page and see what comes back"}
            </h2>
            <p className="max-w-xl leading-relaxed text-dim">
              {user
                ? "Pick up where you left off — capture a page, review what's waiting, or check what's coming due."
                : "Sign in with an email link or a password. Nothing to install, no card, and a demo aircraft is already loaded so you can look around first."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={primary.href}
                className={`rounded-md bg-accent px-5 py-3 font-medium text-bg hover:opacity-90 ${FOCUS}`}
              >
                {primary.label} →
              </Link>
              <Link
                href="/compare"
                className={`rounded-md border border-line px-5 py-3 text-dim hover:border-line2 hover:text-ink ${FOCUS}`}
              >
                How it compares
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-10">
        <div className={`${CONTAINER} flex flex-col gap-5 text-sm text-faint`}>
          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-x-5 gap-y-2"
          >
            {NAV.map((l) => (
              <Link key={l.href} href={l.href} className={`hover:text-ink ${FOCUS}`}>
                {l.label}
              </Link>
            ))}
            <a
              href="https://github.com/iiamit/MyTailLog"
              className={`hover:text-ink ${FOCUS}`}
            >
              Source on GitHub (MIT)
            </a>
          </nav>
          <p className="max-w-3xl leading-relaxed">
            MyTailLog is an index and decision-support layer, not the legal
            maintenance record. The physical logbooks remain the system of
            record (14 CFR 91.417). Confirm anything you rely on against them.
          </p>
        </div>
      </footer>

      {/* Structured data for search engines. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "MyTailLog",
            applicationCategory: "UtilitiesApplication",
            applicationSubCategory: "Aircraft maintenance recordkeeping",
            operatingSystem: "Web, iOS (TestFlight beta)",
            url: "https://mytaillog.com",
            description:
              "Free, open-source aircraft logbook digitizer and maintenance tracker for general aviation owners. A vision model reads paper airframe, engine, prop and avionics logbooks into a searchable index with AD/SB compliance, a Part 91 maintenance forecast, plain-English Q&A over the entries, and automatic backups to storage you own.",
            isAccessibleForFree: true,
            license: "https://opensource.org/licenses/MIT",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            sameAs: ["https://github.com/iiamit/MyTailLog"],
            featureList: [
              "Vision-model extraction of scanned logbook pages with per-field confidence and a review screen",
              "CSV import with AI column mapping and deterministic row conversion",
              "Searchable timeline across airframe, engine, prop, avionics and other logbooks",
              "AD/SB compliance with FAA Federal Register reference lookup and AD discovery",
              "Part 91 maintenance forecast with hours-based items projected to calendar dates",
              "Plain-English questions answered from your entries with the source entries cited",
              "Records gap audit and installed-equipment reconstruction from the logs",
              "Weight & balance revision history",
              "Squawk tracking with severity and resolution",
              "Oil analysis wear-metal trends and oil consumption rate",
              "Hobbs and tach reconciliation, MyFlightBook hours sync, opt-in ADS-B passive hours",
              "Email reminders with configurable lead times",
              "Full .zip backup and automatic scheduled backups to your own Dropbox or Google Drive",
              "Read-only OAuth 2.1 API with per-aircraft consent and a developer portal",
            ],
          }),
        }}
      />
    </>
  );
}
