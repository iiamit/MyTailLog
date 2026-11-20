import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PublicTheme } from "@/components/PublicTheme";
import { StoreBadges } from "@/components/StoreBadges";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/appStore";

const features = [
  { title: "Read the paper", body: "Scan or upload airframe, engine, propeller and avionics pages. AI drafts the entries; you confirm them beside the original ink." },
  { title: "Find the answer", body: "Search across your books or ask a question in plain English. Answers cite the entries and show the source page." },
  { title: "Know what is due", body: "See inspections, recurring work and ADs by date or aircraft hours. Trace a reminder back to the record behind it." },
  { title: "Keep the small things", body: "Record tach and Hobbs, oil added, squawks, installed equipment, weight and balance, and the documents you carry aboard." },
  { title: "Write and sign", body: "Create a maintenance entry from a preventive-maintenance template, sign it with a certificate and emailed code, then print a logbook sticker." },
  { title: "Take it with you", body: "The free iPhone, iPad and Android apps keep synced records and documents available offline and queue changes until you reconnect." },
];

const links = [
  ["FAQ", "/faq"], ["How it compares", "/compare"], ["Coming from MyFBO", "/switch/myfbo"],
  ["Help", "/help"], ["Developer API", "/developers/docs"], ["What’s new", "/whats-new"],
  ["Privacy", "/privacy"], ["Delete account", "/account-deletion"],
] as const;

export default async function Home() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const start = user ? "/hangar" : "/login?mode=create";
  return <PublicTheme>
    <main id="main-content">
      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-7 sm:py-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-12">
        <div className="rounded-leaf bg-leaf px-6 py-9 shadow-leaf sm:px-9 sm:py-12">
          <p className="text-label font-bold text-section-ink-status">Aircraft records, within reach</p>
          <h1 className="mt-4 max-w-[18ch] text-[clamp(2.3rem,4.5vw,4rem)] font-extrabold leading-[1.08] tracking-[-.025em] text-ink">Your logbooks can answer you.</h1>
          <p className="mt-6 max-w-[55ch] text-lede text-ink-2">Turn photographed pages into a searchable record. See what is due, find the page that proves it, and keep your aircraft&apos;s history close wherever you fly.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={start} className="state-layer inline-flex min-h-12 items-center rounded-control bg-section-status px-5 font-bold text-white">{user ? "Open your hangar" : "Create a free account"}</Link>
            <Link href="/demo" className="state-layer inline-flex min-h-12 items-center rounded-control border border-control-border bg-leaf px-5 font-bold text-ink">Explore the demo</Link>
          </div>
          <div className="mt-6"><StoreBadges /></div>
          <p className="mt-5 text-small text-ink-3">Free and open source under the MIT licence. No card or trial clock.</p>
        </div>
        <figure className="overflow-hidden rounded-leaf bg-leaf shadow-leaf">
          <Image src="/brand/status-preview.jpg" alt="Illustration of the new MyTailLog Status board: due items beside a cited logbook page" width={1440} height={900} priority className="h-auto w-full" />
          <figcaption className="px-4 py-3 text-small text-ink-3">Illustration of the new Status view using the fictional demo aircraft.</figcaption>
        </figure>
      </section>

      <section className="bg-leaf-2 py-14 sm:py-18">
        <div className="mx-auto max-w-6xl px-5 sm:px-7">
          <div className="max-w-2xl"><p className="text-label text-section-ink-status">One connected record</p><h2 className="mt-2 text-board-title">From scanned page to a decision you can check</h2><p className="mt-3 text-body text-ink-2">Every useful summary should lead back to the page or reading behind it. You stay in control of what AI extracted and what counts as confirmed.</p></div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{features.map((f) => <article key={f.title} className="rounded-leaf bg-leaf p-6 shadow-leaf"><h3 className="text-heading">{f.title}</h3><p className="mt-2 text-body text-ink-2">{f.body}</p></article>)}</div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-7 lg:grid-cols-2 lg:gap-16">
        <div><p className="text-label text-section-ink-status">Start with one page</p><h2 className="mt-2 text-board-title">A clear path from paper to digital</h2>
          <ol className="mt-5 space-y-4">{[
            ["1", "Add an aircraft", "Enter a tail number and today’s meter readings."],
            ["2", "Capture pages", "Use the mobile scanner or upload existing PDFs and images."],
            ["3", "Confirm the reading", "Review extracted entries beside the scan before they affect forecasts."],
            ["4", "Use the history", "Search, ask, plan maintenance and share a buyer’s dossier."],
          ].map(([n, title, body]) => <li key={n} className="flex gap-4 border-t border-rule pt-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-section-status font-bold text-white">{n}</span><span><strong className="text-body-strong">{title}</strong><span className="mt-1 block text-small text-ink-2">{body}</span></span></li>)}</ol>
        </div>
        <div className="rounded-leaf bg-leaf-2 p-6 sm:p-8"><p className="text-label text-section-ink-status">Made for owners who fly</p><h2 className="mt-2 text-heading">Your records travel with you</h2>
          <p className="mt-3 text-body text-ink-2">Sign in with Google or Apple, or keep using email and magic links. Connect MyFlightBook when you want its meter readings alongside your maintenance record. Download your data, keep backups, and use the documented API for integrations you authorize.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Link href="/help" className="font-bold text-section-ink-status underline">See how it works</Link><Link href="/developers/docs" className="font-bold text-section-ink-status underline">Developer API</Link></div>
          <p className="mt-8 border-t border-rule pt-5 text-small text-ink-3">MyTailLog is an index and decision-support tool. The physical logbooks remain the legal maintenance record. Confirm anything you rely on against them.</p>
        </div>
      </section>

      <section className="bg-section-status px-5 py-12 text-center text-white"><h2 className="text-board-title">Bring your logbooks into focus.</h2><p className="mx-auto mt-3 max-w-xl text-body">Start free, explore the demo, and add your first page when you are ready.</p><Link href={start} className="mt-6 inline-flex min-h-12 items-center rounded-control bg-leaf px-6 font-bold text-ink">{user ? "Open your hangar" : "Get started free"}</Link></section>
    </main>
    <footer className="mx-auto max-w-6xl px-5 py-8 text-small text-on-cover-2 sm:px-7"><nav aria-label="More about MyTailLog" className="flex flex-wrap gap-x-5 gap-y-2">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}<a href="https://github.com/iiamit/MyTailLog">Source on GitHub</a></nav></footer>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org", "@type": "SoftwareApplication", name: "MyTailLog",
      applicationCategory: "UtilitiesApplication", operatingSystem: "Web, iOS, iPadOS, Android",
      url: "https://mytaillog.com", installUrl: [APP_STORE_URL, PLAY_STORE_URL],
      description: "Free, open-source aircraft logbook digitizer and maintenance tracker with scanned-page review, cited search, maintenance forecasts and offline mobile apps.",
      isAccessibleForFree: true, license: "https://opensource.org/licenses/MIT",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      sameAs: ["https://github.com/iiamit/MyTailLog", APP_STORE_URL, PLAY_STORE_URL],
    }) }} />
  </PublicTheme>;
}
