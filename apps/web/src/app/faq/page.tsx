import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell, MarketingSection } from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "FAQ — cost, data, privacy & getting your records out",
  description:
    "The questions people ask before signing up for MyTailLog: what it costs (nothing — there's no billing), who can see your data, whether it's used to train AI, how accurate the extraction is, and how to get everything back out.",
};

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "cost",
    title: "What does it cost?",
    body: (
      <>
        <p>
          Nothing. There is <strong>no billing in MyTailLog at all</strong> — no plans, no tiers, no
          trial clock, no credit card, no payment code anywhere in the app. The source is public, so
          that isn&apos;t a promise you have to take on trust.
        </p>
        <p>
          The one line item that costs real money is the AI. Reading a logbook page is a vision-model
          call, and those are billed to whoever&apos;s API key is used. By default that&apos;s the
          key of whoever runs the instance, so shared use is capped two ways: a{" "}
          <strong>per-person daily call limit</strong> and an <strong>overall daily-dollar
          ceiling</strong>. If the day&apos;s shared budget is spent, extraction pauses until
          tomorrow — everything else (timeline, status, forecast, reminders, export) keeps working.
        </p>
        <p>
          If you have a backlog of hundreds of pages and don&apos;t want to wait out the cap, add
          your own Anthropic or OpenAI API key in Profile. Then the calls bill to your provider account at its
          list prices and your limit is much higher. See{" "}
          <A href="#api-key">is my API key safe</A>.
        </p>
        <p className="text-sm text-faint">
          AI cost is also kept down by routing printed OCR, PDFs, and text-only questions to the
          provider&apos;s cheapest capable model. Handwritten pages use the stronger vision model
          because transcription accuracy matters more than the small per-page saving.
        </p>
        <p className="text-sm text-faint">
          We&apos;re not going to pretend there&apos;s a price list coming, because there isn&apos;t
          one. If that ever changes, the MIT license and the full ZIP export below mean you are not
          trapped by the change.
        </p>
      </>
    ),
  },
  {
    id: "data",
    title: "What happens to my data, and who can see it?",
    body: (
      <>
        <p>
          Aircraft records — tail numbers, serial numbers, owner names, home base — are treated as
          sensitive personal data. Every row belongs to the users who own or are shared on its
          aircraft, and that&apos;s enforced by <strong>Postgres row-level security</strong>, not by
          application code: access funnels through a single{" "}
          <code className="readout text-[13px]">has_aircraft_access()</code> /{" "}
          <code className="readout text-[13px]">can_edit_aircraft()</code> choke point that every
          table is scoped to. An RLS-isolation regression suite runs in CI on every pull request.
        </p>
        <p>Who can actually read your aircraft:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>You</strong>, the owner.
          </li>
          <li>
            <strong>People you invite</strong>, as viewers (read-only) or editors (can contribute).
            You can remove them at any time.
          </li>
          <li>
            <strong>Apps you consent to</strong> over our OAuth 2.1 API — read-only, limited to the
            aircraft you picked on the consent screen, and{" "}
            <strong>never your log entries or scans</strong>. Revoke any of them under Profile →
            Connected apps.
          </li>
        </ul>
        <p>
          Scanned pages and documents live in a private Google Cloud Storage bucket and are served
          only through access-checked app routes — never from a public CDN URL. Third-party secrets
          are encrypted at rest; see <A href="#api-key">below</A>.
        </p>
        <p>
          And the honest part: whoever operates the hosted instance at mytaillog.com has database
          access, the same as with any hosted service. Two elevated, RLS-bypassing paths exist by
          design — the nightly reminder job (behind a shared-secret gate) and the AI-usage ledger
          write (so the cost guard can&apos;t be forged by a browser) — and nothing else. If you
          don&apos;t want to extend that trust to anyone, <A href="#selfhost">run your own copy</A>;
          that&apos;s exactly why the license is MIT.
        </p>
        <p className="text-sm text-faint">
          The full defensive posture, and how to report a hole in it, is in{" "}
          <a
            href="https://github.com/iiamit/MyTailLog/blob/main/SECURITY.md"
            className="underline decoration-line underline-offset-2 hover:decoration-line2"
          >
            SECURITY.md
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "ai-training",
    title: "Is my data used to train AI models?",
    body: (
      <>
        <p>
          <strong>MyTailLog trains nothing.</strong> There is no training pipeline, no fine-tuning,
          no dataset job, and no code path that pools users&apos; records for any purpose. The
          repository is public — that claim is checkable rather than promised.
        </p>
        <p>
          What does happen: to read a page, its image is sent to the configured <strong>AI provider API</strong>,
          and to answer a question, the relevant entry text is sent the same way. That is the only
          place your records go. What the selected provider does with API traffic is governed by their terms, and
          we&apos;d rather you{" "}
          <a
            href="https://www.anthropic.com/legal/commercial-terms"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line underline-offset-2 hover:decoration-line2"
          >
            read those directly
          </a>{" "}
          than take our paraphrase of someone else&apos;s policy.
        </p>
        <p>
          If you&apos;d rather that relationship be yours and not ours, add your own Anthropic or OpenAI API
          key — then the calls are made under your account, subject to your agreement with them.
        </p>
      </>
    ),
  },
  {
    id: "paper",
    title: "Does this replace my paper logbooks?",
    body: (
      <>
        <p>
          <strong>No.</strong> Not partly, not eventually. Your physical logbooks remain the system
          of record under <strong>14 CFR 91.417</strong>. MyTailLog is an index of them and a
          decision-support layer on top — it is not a maintenance record, not an airworthiness
          determination, and not a sign-off.
        </p>
        <p>
          This is a design decision, not a missing feature. Electronic signatures are{" "}
          <strong>explicitly out of scope</strong> precisely so the product stays on the index side
          of the line and out of AC 120-78A territory. Keep the books; keep them safe; use this to
          find things in them and to see what&apos;s coming due.
        </p>
      </>
    ),
  },
  {
    id: "accuracy",
    title: "How accurate is the extraction?",
    body: (
      <>
        <p>
          We don&apos;t publish an accuracy percentage, and we&apos;re not going to. A single number
          spanning crisp typed 2019 entries and a smudged 1963 fountain-pen scrawl would be
          marketing, not information — your books are not the average of everyone&apos;s books.
        </p>
        <p>What we give you instead is the ability to see, per field, where it was unsure:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>A confidence score on every field</strong> — date, hours, work performed, parts,
            AD/SB references, signature — shown as a percentage on the field itself, with anything
            below threshold highlighted.
          </li>
          <li>
            <strong>A cropped snippet of the scan beside each field</strong>, showing exactly where
            that value was read from, so you can confirm it without hunting the page.
          </li>
          <li>
            <strong>The full page image next to the entries</strong>, always.
          </li>
          <li>
            <strong>Bulk confirm only for the clean ones</strong> — &ldquo;Confirm N clean&rdquo;
            accepts only entries with a high overall score, no flagged field, and no page-spanning
            fragment. Anything doubtful is left for you.
          </li>
        </ul>
        <p>
          Where it struggles, so you know before you hit it: heavy cursive handwriting, faded or
          bled ink, stamps overlapping text, and scanned <em>spreads</em> where two physical pages
          sit side by side in one image (those get flagged so you can review both halves).
        </p>
        <p className="text-sm text-faint">
          If you want a human&apos;s guarantee on every single entry rather than a model&apos;s
          flagged uncertainty, that&apos;s a real and reasonable preference — see{" "}
          <Link
            href="/compare"
            className="underline decoration-line underline-offset-2 hover:decoration-line2"
          >
            how it compares
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: "wrong",
    title: "What happens if the AI gets something wrong?",
    body: (
      <>
        <p>
          You fix it, and nothing downstream is stuck. Every extracted field is editable in the
          review screen with the original scan beside it; editing an entry marks it confirmed. You
          can also <strong>re-extract</strong> a whole page if it was read badly — that replaces
          that page&apos;s entries rather than duplicating them — and there&apos;s a{" "}
          <strong>duplicate finder</strong> for when re-captures and re-extractions pile up.
        </p>
        <p>
          Everything derived — the status grid, the maintenance forecast, the AD list, the equipment
          list, the gap audit — is computed from your entries, so correcting an entry corrects the
          views that read it. Extraction can also ripple: reading a maintenance page will propose
          equipment installs/removals and advance maintenance last-done dates.{" "}
          <Link
            href="/help"
            className="underline decoration-line underline-offset-2 hover:decoration-line2"
          >
            Help
          </Link>{" "}
          marks every one of those ripple effects.
        </p>
        <p>
          None of it is authoritative. Nothing here is a substitute for reading the entry in the
          book before you act on it — that&apos;s why the page image never leaves the screen.
        </p>
      </>
    ),
  },
  {
    id: "import",
    title: "I'm coming from another platform — can I bring a CSV in?",
    body: (
      <>
        <p>
          Yes. Export your maintenance history as <strong>CSV</strong> and import it directly —
          you don&apos;t have to print it to PDF and run it through the page extractor.
        </p>
        <p>
          There is no importer per vendor, because <strong>the columns are mapped, not the
          rows</strong>. One AI pass reads your header row plus a few sample rows and proposes what
          each column means — &ldquo;Tach Out&rdquo; → Tach, &ldquo;A&amp;P&rdquo; → Signature,
          &ldquo;Invoice #&rdquo; → don&apos;t import. You confirm or correct that{" "}
          <strong>once</strong>, and then every row is converted in plain code, so the same file
          always imports the same way and nothing is invented per row.
        </p>
        <p>
          <strong>Dates are never guessed.</strong>{" "}
          <code className="readout text-[13px]">03/04/2026</code> is 3 April or 4 March depending on
          who exported it. The whole date column is scanned, and the first date with a day past the
          12th settles the reading for the file; you&apos;re asked only when every row genuinely
          reads both ways, and then you&apos;re shown what the first few dates become each way.
        </p>
        <p>
          You see a count of what will be created before anything is written, and imported entries
          land <strong>unconfirmed</strong> — a foreign spreadsheet doesn&apos;t get to drive a
          reminder or an annual-due date until you&apos;ve reviewed it.
        </p>
        <p className="text-sm text-faint">
          Limits, stated plainly: CSV only (save your XLSX as CSV first), maintenance log entries
          only as the target, 5 MB / 5,000 rows per file. Importing into an aircraft that already
          has entries can create duplicates — there&apos;s a screen for finding those.
        </p>
      </>
    ),
  },
  {
    id: "export",
    title: "Can I get my data out?",
    body: (
      <>
        <p>Yes — immediately, yourself, with no request form and no waiting on a job queue:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>CSV</strong> per data set — log entries, AD/SB compliance, equipment, maintenance
            items.
          </li>
          <li>
            <strong>A printable records bundle</strong> — Print → Save as PDF gives you the full
            history, forecast, and compliance state as a document.
          </li>
          <li>
            <strong>A complete <code className="readout text-[13px]">.zip</code> backup</strong> —
            a manifest, every aircraft-scoped row verbatim as JSON, and the{" "}
            <strong>original scanned images and documents</strong>. It <strong>re-imports</strong>{" "}
            into any MyTailLog instance, including one you host yourself, and the import is
            non-destructive (it creates a new aircraft).
          </li>
        </ul>
        <p>
          You don&apos;t have to remember to do it, either — MyTailLog can push that same ZIP to{" "}
          <A href="#cloud-backup">cloud storage you own</A> on a schedule. It&apos;s also the clean
          way to hand an aircraft&apos;s full history to a buyer.
        </p>
        <p className="text-sm text-faint">
          What we don&apos;t have yet: pilot-logbook interchange formats (ForeFlight / MyFlightbook
          CSV). Maintenance records export fully; those two flight-logging formats aren&apos;t
          written today.
        </p>
      </>
    ),
  },
  {
    id: "cloud-backup",
    title: "Can it back up to my own Dropbox or Google Drive automatically?",
    body: (
      <>
        <p>
          Yes. Connect <strong>Dropbox</strong> and/or <strong>Google Drive</strong> in Profile, pick{" "}
          <strong>monthly</strong> or <strong>quarterly</strong>, and the same re-importable{" "}
          <code className="readout text-[13px]">.zip</code> described above is pushed there on that
          schedule — one archive per aircraft, named{" "}
          <code className="readout text-[13px]">&lt;TAIL&gt;/&lt;date&gt;-&lt;TAIL&gt;.zip</code>.
          It&apos;s off until you connect something.
        </p>
        <p>
          Connect <em>both</em> if you want to: they run independently, on separate schedules, each
          reporting its own status. That gives you copies in two different companies&apos; clouds,
          which is a materially better position than trusting any one of us — including us.
        </p>
        <p>
          <strong>MyTailLog cannot read the rest of your storage</strong>, and that&apos;s enforced
          by the permission we ask for rather than by a promise. Dropbox uses an{" "}
          <strong>App folder</strong>, so we only ever see our own folder. Google uses{" "}
          <code className="readout text-[13px]">drive.file</code>, which grants access only to files
          the app itself created. Neither can list, read, or touch anything else you keep there. We
          also don&apos;t request your email address from either provider.
        </p>
        <p>
          <strong>Nothing in your account is ever deleted or overwritten.</strong> Each run writes a
          new dated file and leaves every previous one alone, so retention is yours to manage.
          Automatically pruning someone else&apos;s cloud storage isn&apos;t a risk worth taking for
          the disk space it would save.
        </p>
        <p>
          <strong>Disconnecting destroys the tokens.</strong> Revoking a destination in Profile
          erases the stored access and refresh tokens outright — not a flag on a row — so nothing
          decryptable is left behind. The archives already in your cloud are yours and stay put.
          While connected, the tokens are encrypted (AES-256-GCM) in a database schema that
          isn&apos;t reachable over the API at all, and are never sent to the browser.
        </p>
        <p>
          <strong>If a backup fails you get told.</strong> Profile shows the last run, its status and
          its size; after two consecutive failures you get an email. A backup that quietly stopped
          working months ago is worse than no backup, because you believed you had one. Very large
          aircraft (currently over 400 MB of scans) are reported as skipped rather than failing
          silently — take a manual ZIP for those.
        </p>
        <p className="text-sm text-faint">
          This is a copy of the index, not a substitute for the paper. See{" "}
          <A href="#paper">does this replace my paper logbooks</A>.
        </p>
      </>
    ),
  },
  {
    id: "stops",
    title: "What happens if the project stops?",
    body: (
      <>
        <p>
          Worth asking, and here&apos;s the straight answer: MyTailLog is maintained by{" "}
          <strong>one person</strong>, there is no company, no revenue, and no SLA. Nothing about
          this is a promise of perpetual uptime, and{" "}
          <a
            href="https://github.com/iiamit/MyTailLog/blob/main/SECURITY.md"
            className="underline decoration-line underline-offset-2 hover:decoration-line2"
          >
            SECURITY.md
          </a>{" "}
          says the same about response times.
        </p>
        <p>What that risk is bounded by:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>MIT license, public repository.</strong> The whole application, schema, and
            RLS policies are yours to run. Nobody can withdraw that.
          </li>
          <li>
            <strong>The ZIP round trip.</strong> Records <em>and</em> original scans, re-importable.
            Take one today and you already hold a complete copy.
          </li>
          <li>
            <strong>No proprietary format.</strong> The archive is a manifest plus plain JSON rows
            plus your image files — readable with or without this app.
          </li>
        </ul>
        <p>
          A shutdown would cost you a migration, not your records. That is deliberately a much
          smaller failure than the one that brings most people to a page like this.
        </p>
      </>
    ),
  },
  {
    id: "selfhost",
    title: "Can I self-host it?",
    body: (
      <>
        <p>
          Yes. MIT-licensed, and the deployment path is documented rather than theoretical. You
          need a <strong>Supabase project</strong> (Postgres + Auth), an{" "}
          <strong>Anthropic or OpenAI API key</strong>, and somewhere to run a Next.js server — the README
          walks through Firebase App Hosting on Cloud Run, which is what mytaillog.com runs on. A
          Google Cloud Storage bucket holds the scans; Resend plus a scheduled daily POST enable the
          reminder emails, and both are optional.
        </p>
        <p>
          The friction you should know about up front: SQL migrations are applied{" "}
          <strong>by hand, in order</strong>, through the Supabase SQL editor — the repo isn&apos;t
          CLI-linked. And the security policy explicitly puts{" "}
          <strong>self-hosted deployments out of its scope</strong>: your environment, your keys,
          your Supabase project to secure.
        </p>
      </>
    ),
  },
  {
    id: "api-key",
    title: "Is my AI API key safe here?",
    body: (
      <>
        <p>
          First: it&apos;s optional. Everything works on the shared key within the daily caps; you
          only add your own to lift them and bill your own account.
        </p>
        <p>If you do add one:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            It&apos;s stored <strong>AES-256-GCM encrypted at rest</strong>, alongside our other
            third-party credentials.
          </li>
          <li>
            The ciphertext lives in a Postgres schema that is <strong>not exposed over the REST
            API</strong> and is reachable only through{" "}
            <code className="readout text-[13px]">SECURITY DEFINER</code> functions granted to the
            server role — it isn&apos;t in browser reach even in encrypted form.
          </li>
          <li>
            It is <strong>decrypted server-side only</strong> and never sent back to the browser.
            After you save it, only the last four characters are ever displayed.
          </li>
          <li>You can remove it at any time from Profile.</li>
        </ul>
        <p>
          Why encryption on top of RLS: row-level security already stops other users from reading
          the row. The encryption is aimed at a different failure — a leaked database backup or read
          replica, where RLS isn&apos;t in the picture. What it does <em>not</em> defend against is
          someone who has both the running server and its encryption key; no at-rest scheme does.
        </p>
        <p className="text-sm text-faint">
          It must be a console API key (starting <code className="readout text-[13px]">sk-ant-</code>)
          with pay-as-you-go credit. A Claude.ai Pro or Max subscription is a different product and
          has no API access — it won&apos;t work here.
        </p>
      </>
    ),
  },
  {
    id: "supported",
    title: "What aircraft and logbook types are supported?",
    body: (
      <>
        <p>
          Each aircraft gets <strong>five logbooks</strong>: airframe, engine, prop, avionics, and{" "}
          <strong>Other</strong> — the last for A&amp;P paperwork rather than running maintenance.
          Scan a weight &amp; balance sheet into Other and it becomes a new W&amp;B revision; scan an
          AD compliance report and it becomes the ground truth for your AD state. Permanent records
          (airworthiness certificate, registration, radio station authorization, POH/AFM, STCs, 337s,
          8130-3s, manuals) go in the Records Vault.
        </p>
        <p>
          The product is sized for a <strong>piston GA owner</strong> and the people they share the
          plane with. The recurring items seeded for you are the Part 91 set — annual (91.409),
          transponder (91.413), pitot-static/altimeter (91.411), ELT (91.207), VOR check (91.171),
          100-hour — plus advisory items (oil change, engine TBO, prop overhaul) that are marked
          non-regulatory so they&apos;re never mistaken for legal requirements. Intervals are
          defaults you can change.
        </p>
        <p>
          Nothing stops you enrolling anything else, but be clear-eyed about what isn&apos;t modeled:{" "}
          <strong>no turbine or Part 135/121 inspection programs</strong>, no progressive inspection
          programs, and no multi-fleet MRO management. Enrollment auto-fills make, model, and serial
          from the <strong>FAA registry</strong> by tail number, so non-US registrations mean typing
          those in yourself.
        </p>
        <p className="text-sm text-faint">
          Pages come in as PDF, JPEG, or PNG (multi-page PDFs are split into one page each), or
          straight from your phone&apos;s own camera app.
        </p>
      </>
    ),
  },
  {
    id: "coowners",
    title: "Does every co-owner need their own account?",
    body: (
      <>
        <p>
          Each person signs in as themselves — but you don&apos;t have to set anything up for them
          first. Invite an email address as a <strong>viewer</strong> (read-only) or an{" "}
          <strong>editor</strong> (can contribute), and access appears the moment that person signs
          in with that address. There is no seat cost, because there is no cost.
        </p>
        <p>
          Two roles, not five. Sharing, ownership transfer, and deletion are owner-only. Squawks are
          the deliberate exception: <strong>anyone with access can report</strong> an in-flight
          discrepancy, and editors resolve them — a renter or a partner shouldn&apos;t need edit
          rights to tell you the nav light is out.
        </p>
        <p className="text-sm text-faint">
          There is no self-serve account deletion yet. You can delete any aircraft yourself
          (type-to-confirm, which removes its records and scans); to have the account itself removed,
          email <span className="readout text-[13px]">mytaillog@iamit.org</span>.
        </p>
      </>
    ),
  },
];

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="underline decoration-line underline-offset-2 hover:decoration-line2">
      {children}
    </a>
  );
}

export default function FaqPage() {
  return (
    <MarketingShell
      eyebrow="Questions"
      title="Questions before you sign up"
      current="/faq"
      lede={
        <>
          The commercial and trust questions — cost, privacy, accuracy, and getting your data back
          out.{" "}
          <Link
            href="/help"
            className="underline decoration-line underline-offset-2 hover:decoration-line2"
          >
            Help &amp; documentation
          </Link>{" "}
          covers how each feature works; this page doesn&apos;t repeat it.
        </>
      }
    >
      <nav className="mb-8 grid gap-1 rounded-lg border border-line p-4 text-sm sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-sm px-2 py-1 text-dim hover:bg-panel2 hover:text-ink"
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-8">
        {SECTIONS.map((s) => (
          <MarketingSection key={s.id} id={s.id} title={s.title}>
            {s.body}
          </MarketingSection>
        ))}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                q: "What does MyTailLog cost?",
                a: "Nothing. There is no billing, no plans and no trial clock. The metered cost is AI calls, which are capped per person per day on the shared key; you can add your own Anthropic or OpenAI API key to bill your own account and lift the limit.",
              },
              {
                q: "Does MyTailLog replace my paper logbooks?",
                a: "No. The physical logbooks remain the system of record under 14 CFR 91.417. MyTailLog is a searchable index and decision-support layer, not a maintenance record, an airworthiness determination, or a sign-off.",
              },
              {
                q: "Is my data used to train AI models?",
                a: "MyTailLog trains nothing — there is no training pipeline in the (public, MIT-licensed) codebase. Page images and entry text are sent to the configured AI provider to be read; that traffic is governed by that provider's terms.",
              },
              {
                q: "Can I import a CSV from another maintenance platform?",
                a: "Yes. Export as CSV and import it directly. Rather than an importer per vendor, one AI pass maps your COLUMNS to fields — you confirm that mapping once and every row is then converted deterministically in code. Dates are never guessed: the whole date column is scanned and you're only asked which way round they read when every row is genuinely ambiguous. Imported entries land unconfirmed until you review them.",
              },
              {
                q: "Can I get my data out of MyTailLog?",
                a: "Yes, immediately and yourself: CSV per data set, a printable records bundle, and a complete .zip backup containing every row as JSON plus the original scans — which re-imports into any MyTailLog instance, including one you host yourself.",
              },
              {
                q: "Can I self-host MyTailLog?",
                a: "Yes. It is MIT-licensed and the deployment path (Supabase, an Anthropic or OpenAI API key, a Next.js host, optional Google Cloud Storage and reminder email) is documented in the repository.",
              },
            ].map(({ q, a }) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: { "@type": "Answer", text: a },
            })),
          }),
        }}
      />
    </MarketingShell>
  );
}
