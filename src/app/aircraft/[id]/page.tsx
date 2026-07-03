import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";
import { LOGBOOK_LABEL } from "@/lib/logbooks";
import { urgencyOf } from "@/lib/compliance";
import { effectiveNextDue } from "@/lib/maintenance";
import { getCurrentHours } from "@/lib/aircraftHours";
import { getAircraftRole, canEditRole } from "@/lib/access";
import {
  ClockIcon,
  CpuIcon,
  WrenchIcon,
  ShieldIcon,
  AlertIcon,
  ArchiveIcon,
  UsersIcon,
  ChevronRightIcon,
  CameraIcon,
  UploadIcon,
} from "@/components/icons";
import { PagesPanel, type PageRow, type LogbookTile } from "./PagesPanel";

type Badge = { text: string; tone: string } | null;

function HubCard({
  href,
  icon,
  title,
  desc,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: Badge;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
    >
      <span className="mt-0.5 text-lg text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          {badge && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${badge.tone}`}>{badge.text}</span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{desc}</span>
      </span>
      <ChevronRightIcon className="mt-1 shrink-0 text-slate-300 group-hover:text-slate-500 dark:text-slate-600" />
    </Link>
  );
}

function HubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

const BUCKET = process.env.LOGBOOK_STORAGE_BUCKET || "logbook-pages";

export default async function AircraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS restricts this to the owner; a non-owner id simply returns no row.
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("*")
    .eq("id", id)
    .single();

  if (!aircraft) notFound();

  const role = await getAircraftRole(supabase, id, aircraft.owner_id);
  const isOwner = role === "owner";
  const canEdit = canEditRole(role);

  const { data: logbooks } = await supabase
    .from("logbook")
    .select("id, type, component_ref, title")
    .eq("aircraft_id", id);

  const labelFor = (logbookId: string) => {
    const lb = logbooks?.find((l) => l.id === logbookId);
    return lb ? lb.title ?? LOGBOOK_LABEL[lb.type] ?? lb.type : "Logbook";
  };

  const { data: pages } = await supabase
    .from("page")
    .select(
      "id, logbook_id, page_sequence, review_status, extraction_status, detected_page_count, extraction_error, storage_path, thumbnail_path",
    )
    .eq("aircraft_id", id)
    .order("logbook_id", { ascending: true })
    .order("page_sequence", { ascending: true, nullsFirst: false });

  // Short-lived signed URLs for page thumbnails (private bucket). Prefer the
  // small thumbnail; fall back to the original for pages without one yet.
  // Sign both the thumbnail (list) and the original (lightbox on click).
  const thumbById = new Map<string, string>();
  const fullById = new Map<string, string>();
  const pathMeta = new Map<string, { id: string; kind: "thumb" | "full" }>();
  for (const p of pages ?? []) {
    pathMeta.set(p.storage_path, { id: p.id, kind: "full" });
    if (p.thumbnail_path) pathMeta.set(p.thumbnail_path, { id: p.id, kind: "thumb" });
  }
  const paths = [...pathMeta.keys()];
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, 3600);
    for (const s of signed ?? []) {
      const meta = s.path ? pathMeta.get(s.path) : undefined;
      if (meta && s.signedUrl) {
        (meta.kind === "thumb" ? thumbById : fullById).set(meta.id, s.signedUrl);
      }
    }
  }

  // Per-page extracted-entry counts.
  const { data: entries } = await supabase
    .from("log_entry")
    .select("page_id")
    .eq("aircraft_id", id);

  const entryCount = entries?.length ?? 0;
  const entryCounts = new Map<string, number>();
  for (const e of entries ?? []) {
    if (e.page_id) entryCounts.set(e.page_id, (entryCounts.get(e.page_id) ?? 0) + 1);
  }

  // Per-logbook captured-page counts, for the logbook cards below.
  const pageCounts = new Map<string, number>();
  for (const p of pages ?? []) {
    pageCounts.set(p.logbook_id, (pageCounts.get(p.logbook_id) ?? 0) + 1);
  }

  // Pending equipment suggestions (from page extraction / log scans) to badge.
  const { count: equipmentProposalCount } = await supabase
    .from("equipment_proposal")
    .select("id", { count: "exact", head: true })
    .eq("aircraft_id", id);

  // Overdue/due-soon maintenance count for the forecast badge.
  const { data: mxItems } = await supabase
    .from("maintenance_item")
    .select("kind, interval_hours, last_done_hours, next_due_date, next_due_hours")
    .eq("aircraft_id", id);
  const currentHobbs = await getCurrentHours(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
  });
  const mxList = mxItems ?? [];
  const dueSoonCount = mxList.filter((m) => {
    const u = urgencyOf(effectiveNextDue(m, mxList), currentHobbs);
    return u === "overdue" || u === "due_soon";
  }).length;

  const pageRows: PageRow[] = (pages ?? []).map((p) => ({
    id: p.id,
    logbookId: p.logbook_id,
    logbookLabel: labelFor(p.logbook_id),
    pageSequence: p.page_sequence,
    reviewStatus: p.review_status,
    extractionStatus: p.extraction_status,
    detectedPageCount: p.detected_page_count,
    extractionError: p.extraction_error,
    entryCount: entryCounts.get(p.id) ?? 0,
    thumbnailUrl: thumbById.get(p.id) ?? fullById.get(p.id) ?? null,
    fullUrl: fullById.get(p.id) ?? null,
    storagePath: p.storage_path,
    needsThumbnail: !p.thumbnail_path,
  }));

  const logbookTiles: LogbookTile[] = (logbooks ?? []).map((lb) => ({
    id: lb.id,
    label: lb.title ?? LOGBOOK_LABEL[lb.type] ?? lb.type,
    componentRef: lb.component_ref,
    pageCount: pageCounts.get(lb.id) ?? 0,
  }));

  const extractionConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← All aircraft
      </Link>

      <header className="mt-2 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{aircraft.tail_number}</h1>
          {!isOwner && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Shared with you · {canEdit ? "contribute" : "view only"}
            </span>
          )}
        </div>
        <p className="text-slate-600 dark:text-slate-300">
          {[aircraft.year, aircraft.make, aircraft.model]
            .filter(Boolean)
            .join(" ") || "Details not set"}
          {aircraft.serial_number ? ` · S/N ${aircraft.serial_number}` : ""}
        </p>
      </header>

      <div className="mb-6">
        <Disclaimer />
      </div>

      <div className="mb-8 flex flex-col gap-6">
        <HubSection title="Records">
          <HubCard
            href={`/aircraft/${id}/timeline`}
            icon={<ClockIcon />}
            title="Timeline & search"
            desc="Every entry across all logbooks, merged by date"
            badge={
              entryCount > 0
                ? {
                    text: `${entryCount} ${entryCount === 1 ? "entry" : "entries"}`,
                    tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                  }
                : null
            }
          />
          <HubCard
            href={`/aircraft/${id}/equipment`}
            icon={<CpuIcon />}
            title="Installed equipment"
            desc="Components on the aircraft now, derived from the logs"
            badge={
              equipmentProposalCount
                ? {
                    text: `${equipmentProposalCount} new`,
                    tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
                  }
                : null
            }
          />
        </HubSection>

        <HubSection title="Airworthiness">
          <HubCard
            href={`/aircraft/${id}/maintenance`}
            icon={<WrenchIcon />}
            title="Maintenance forecast"
            desc="Part 91 recurring items & when they're next due"
            badge={
              dueSoonCount > 0
                ? {
                    text: `${dueSoonCount} due`,
                    tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                  }
                : null
            }
          />
          <HubCard
            href={`/aircraft/${id}/compliance`}
            icon={<ShieldIcon />}
            title="AD / SB compliance"
            desc="Directives, compliance method, and next due"
          />
          <HubCard
            href={`/aircraft/${id}/audit`}
            icon={<AlertIcon />}
            title="Records gap audit"
            desc="Suspected gaps in the paper trail"
          />
        </HubSection>

        <HubSection title="Manage">
          <HubCard
            href={`/aircraft/${id}/export`}
            icon={<ArchiveIcon />}
            title="Export & backup"
            desc="Print/PDF, CSV, or a full re-importable .zip"
          />
          {isOwner && (
            <HubCard
              href={`/aircraft/${id}/share`}
              icon={<UsersIcon />}
              title="Sharing, transfer & delete"
              desc="Invite viewers/editors, hand off, or delete"
            />
          )}
        </HubSection>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Logbooks &amp; pages</h2>
          {canEdit && (
            <div className="flex gap-2">
              <Link
                href={`/aircraft/${id}/upload`}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:border-slate-500 dark:border-slate-700"
              >
                <UploadIcon />
                Upload scans
              </Link>
              <Link
                href={`/aircraft/${id}/capture`}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                <CameraIcon />
                Capture pages
              </Link>
            </div>
          )}
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Click a logbook to show only its pages. Click a page thumbnail to
          magnify it.
        </p>
        <PagesPanel
          aircraftId={id}
          logbooks={logbookTiles}
          pages={pageRows}
          extractionConfigured={extractionConfigured && canEdit}
          canEdit={canEdit}
        />
      </section>
    </main>
  );
}
