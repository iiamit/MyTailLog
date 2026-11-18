import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SectionLanding, type InterimLink } from "@/ui/SectionLanding";
import type { SubTab } from "@/ui/Board";
import type { Section } from "@/lib/uiV2";

export const aircraftTail = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("aircraft").select("tail_number").eq("id", id).maybeSingle();
  return data?.tail_number ?? "";
});

type Landing = {
  section: Section;
  title: string;
  intro: string;
  subTabs?: (a: string) => SubTab[];
  links: InterimLink[];
};

// Sub-tabs and section contents per 03 §4; links point at today's pages until each phase replaces them.
const LANDINGS: Record<string, Landing> = {
  status: {
    section: "status",
    title: "Status",
    intro: "What is due, by date and by hours, from confirmed records.",
    links: [
      { label: "What's due", detail: "Inspections, ADs and recurring items", path: "status" },
      { label: "Forecast", detail: "What comes due over the next months", path: "maintenance" },
      { label: "Annual prep", detail: "Get ready for the annual with your IA", path: "annual" },
    ],
  },
  logbooks: {
    section: "books",
    title: "Logbooks",
    intro: "Every page you added, read into entries you confirm beside the scan.",
    links: [
      { label: "Timeline and search", detail: "Every entry, newest first", path: "timeline" },
      { label: "Pages", detail: "The scanned pages, book by book", path: "pages" },
      { label: "Review", detail: "Confirm what the AI read", path: "review" },
      { label: "Add pages", detail: "Photograph or upload logbook pages", path: "capture" },
      { label: "Ask", detail: "Questions answered from your entries", path: "ask" },
    ],
  },
  maintenance: {
    section: "maint",
    title: "Maintenance",
    intro: "Tracked items, ADs and SBs, and squawks.",
    links: [
      { label: "ADs and SBs", detail: "Applicable directives and their compliance", path: "compliance" },
      { label: "Squawks", detail: "Open and resolved squawks", path: "squawks" },
      { label: "Records check", detail: "Gaps and questions in the records", path: "audit" },
    ],
  },
  hours: {
    section: "aircraft",
    title: "Aircraft",
    intro: "Hours, oil, equipment and weight and balance.",
    links: [
      { label: "Hours and meters", detail: "Tach, hobbs and meter changes", path: "meters" },
      { label: "Oil analysis", detail: "Lab samples and trends", path: "oil-analysis" },
      { label: "Equipment", detail: "What is installed, with its entries", path: "equipment" },
      { label: "Weight and balance", detail: "Revisions and the current figures", path: "weight-balance" },
      { label: "Details", detail: "Tail, serials and home base", path: "details" },
    ],
  },
  documents: {
    section: "docs",
    title: "Documents",
    intro: "Registration, insurance, forms and manuals kept with the aircraft.",
    links: [{ label: "Records Vault", detail: "Every document on file", path: "documents" }],
  },
  share: {
    section: "share",
    title: "Share",
    intro: "Record room links, the people with access, and printed hand-offs.",
    links: [
      { label: "Links and people", detail: "Record rooms and shared access", path: "share" },
      { label: "Pre-buy dossier", detail: "Everything a buyer's mechanic asks for", path: "prebuy" },
      { label: "Maintenance summary", detail: "One printable page of what is due", path: "summary" },
    ],
  },
};

/** A section landing page plus its metadata, for app/v2/aircraft/[id]/<key>/page.tsx. */
export function sectionLanding(key: keyof typeof LANDINGS) {
  const l = LANDINGS[key];
  async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const tail = await aircraftTail(id);
    return (
      <SectionLanding
        aircraftId={id}
        tail={tail}
        section={l.section}
        title={l.title}
        intro={l.intro}
        subTabs={l.subTabs?.(`/aircraft/${id}`)}
        links={l.links}
      />
    );
  }
  async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    return { title: `${l.title} · ${await aircraftTail(id)}` };
  }
  return { Page, generateMetadata };
}
