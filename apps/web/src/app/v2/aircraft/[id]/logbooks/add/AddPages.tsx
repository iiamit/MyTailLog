"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CloudUpload, Copy, Upload, X } from "lucide-react";
import { HungSection, Leaf, Leaves } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { Qr } from "@/ui/Qr";
import { assessQuality, type QualityReport } from "@/lib/capture/imageQuality";
import { isSupportedFile, rasterizeFile } from "@/lib/capture/importFiles";
import { makeThumbnail } from "@/lib/capture/thumbnail";
import { phashOf } from "@/lib/capture/phash";
import { enqueuePage, listQueued, setBatchExpected, type QueuedPage } from "@/lib/capture/queue";
import { drainQueue, registerBackgroundDrain } from "@/lib/capture/uploader";
import {
  allowanceCopy, inFlight, newlyCompleted, plural, queueTotals, readCopy, shotProblem, type QueueAllowance, type QueueBatch,
} from "@/lib/v2/capture";
import { pendingDuplicates, placePagesAfter, type DuplicatePair } from "../actions";

export type Volume = { id: string; type: string; label: string; pages: number; lastSeq: number };
type FileRow = { batchId: string; name: string; total: number | null; uploaded: number; error?: string };
type Session = { logbookId: string; after: number | null; ids: string[]; total: number | null };

const POLL_MS = 5000;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

/** The two leaves of W-BOOKS-06: put pages in (left) and the one queue from upload to review (right). */
export function AddPages({
  aircraftId, volumes, initialVolume, startCamera, origin, waitingForYou, span, map,
}: {
  aircraftId: string; volumes: Volume[]; initialVolume: string; startCamera: boolean; origin: string;
  waitingForYou: number; span: { from: string; to: string } | null; map: React.ReactNode;
}) {
  const router = useRouter();
  const a = `/aircraft/${aircraftId}`;
  const [vol, setVol] = useState(initialVolume);
  const [place, setPlace] = useState<"end" | "after">("end");
  const [after, setAfter] = useState(0);
  const [handwritten, setHandwritten] = useState(true);
  const [online, setOnline] = useState(true);
  const [device, setDevice] = useState(0);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [lowQuality, setLowQuality] = useState(0);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [drag, setDrag] = useState<"window" | "zone" | null>(null);
  const [queue, setQueue] = useState<{ batches: QueueBatch[]; allowance: QueueAllowance } | null>(null);
  const [queueErr, setQueueErr] = useState(false);
  const [dups, setDups] = useState<DuplicatePair[]>([]);
  const [toast, setToast] = useState<{ text: string; batchId: string } | null>(null);
  const [camera, setCamera] = useState(startCamera);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sessions = useRef(new Map<string, Session>());
  const prev = useRef<QueueBatch[]>([]);
  const target = volumes.find((v) => v.id === vol) ?? volumes[0];

  const refreshDevice = useCallback(async () => {
    try {
      setDevice((await listQueued()).filter((p) => p.aircraftId === aircraftId).length);
    } catch {
      /* IndexedDB unavailable (private mode): nothing is kept on the device. */
    }
  }, [aircraftId]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/reading-queue`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const q = (await res.json()) as { batches: QueueBatch[]; allowance: QueueAllowance };
      const done = newlyCompleted(prev.current, q.batches);
      prev.current = q.batches;
      setQueue(q);
      setQueueErr(false);
      if (done.length) {
        setToast({ text: readCopy(done[0]), batchId: done[0].id });
        router.refresh();
      }
      setDups(queueTotals(q.batches).decision > 0 ? await pendingDuplicates(aircraftId) : []);
    } catch {
      setQueueErr(true);
    }
  }, [aircraftId, router]);

  const onUploaded = useCallback((page: QueuedPage) => {
    const id = page.batch?.id;
    if (!id) return;
    setFiles((fs) => fs.map((f) => (f.batchId === id ? { ...f, uploaded: f.uploaded + 1 } : f)));
    const s = sessions.current.get(id);
    if (!s) return;
    s.ids.push(page.id);
    // Every page of the batch is on the server: move them into place when the owner chose "After page {n}".
    if (s.after != null && s.total != null && s.ids.length === s.total) {
      void placePagesAfter(aircraftId, s.logbookId, s.ids, s.after);
    }
  }, [aircraftId]);

  const drainAll = useCallback(async () => {
    for (let i = 0; i < 50; i++) {
      const r = await drainQueue(onUploaded);
      if (r.uploaded === 0) break;
    }
    await refreshDevice();
    void poll();
  }, [onUploaded, poll, refreshDevice]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR renders online; correct it on mount
    setOnline(navigator.onLine);
    // A camera session left open (tab closed before "Done"): close it with the pages it has, so they upload.
    void listQueued().then(async (all) => {
      const open = new Map<string, number>();
      for (const p of all) if (p.aircraftId === aircraftId && p.batch && p.batch.expectedPages == null) open.set(p.batch.id, (open.get(p.batch.id) ?? 0) + 1);
      for (const [id, n] of open) await setBatchExpected(id, n);
    }).catch(() => {}).finally(() => void drainAll());
    const on = () => { setOnline(true); void drainAll(); };
    const off = () => setOnline(false);
    const msg = (e: MessageEvent) => { if (e.data?.type === "drain-capture-queue") void drainAll(); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    navigator.serviceWorker?.addEventListener("message", msg);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      navigator.serviceWorker?.removeEventListener("message", msg);
    };
  }, [aircraftId, drainAll]);

  const busy = device > 0 || (queue ? inFlight(queue.batches) : false) || dups.length > 0;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => (device > 0 && navigator.onLine ? void drainAll() : void poll()), POLL_MS);
    return () => clearInterval(t);
  }, [busy, device, drainAll, poll]);

  // Drag over the window lights the zone (02 §6.5); drop is a pointer enhancement of the file picker.
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { depth++; setDrag((d) => d ?? "window"); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDrag(null); };
    const stop = (e: DragEvent) => { e.preventDefault(); depth = 0; setDrag(null); };
    const over = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", stop);
    };
  }, []);

  const queuePage = async (blob: Blob, report: QualityReport, batch: QueuedPage["batch"]) => {
    await enqueuePage({
      id: crypto.randomUUID(),
      aircraftId,
      logbookId: target.id,
      logbookLabel: target.label,
      pageSequence: null,
      capturedAt: new Date().toISOString(),
      isHandwritten: handwritten,
      blob,
      thumbnailBlob: await makeThumbnail(blob),
      width: report.width,
      height: report.height,
      sharpness: report.sharpness,
      glareRatio: report.glareRatio,
      createdAt: new Date().toISOString(),
      batch,
      phash: (await phashOf(blob)) ?? undefined,
    });
  };

  const addFiles = async (list: FileList | File[]) => {
    const all = [...list];
    const ok = all.filter(isSupportedFile);
    setSkipped(all.filter((f) => !isSupportedFile(f)).map((f) => `${f.name}: not a PDF, JPEG, PNG or HEIC.`));
    for (const file of ok) {
      const batchId = crypto.randomUUID();
      const source = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf" ? "pdf" : "web_upload";
      setFiles((fs) => [{ batchId, name: file.name, total: null, uploaded: 0 }, ...fs]);
      sessions.current.set(batchId, { logbookId: target.id, after: place === "after" ? after : null, ids: [], total: null });
      try {
        const total = await rasterizeFile(file, async (page, _i, n) => {
          setFiles((fs) => fs.map((f) => (f.batchId === batchId ? { ...f, total: n } : f)));
          if (!page.report.ok) setLowQuality((q) => q + 1);
          await queuePage(page.blob, page.report, { id: batchId, source, expectedPages: n });
        });
        sessions.current.get(batchId)!.total = total;
      } catch {
        setFiles((fs) => fs.map((f) => (f.batchId === batchId ? { ...f, error: `${file.name}: couldn't be read.` } : f)));
      }
      await refreshDevice();
    }
    void registerBackgroundDrain();
    await drainAll();
  };

  const t = queue ? queueTotals(queue.batches) : null;
  const open = queue?.batches.filter((b) => !b.completedAt) ?? [];
  const readingOf = open.reduce((n, b) => n + b.expected, 0);
  const readSoFar = open.reduce((n, b) => n + b.read + b.failed, 0);
  const left = t ? t.queued + t.reading + t.waitingAllowance + t.arriving : 0;
  const allow = queue ? allowanceCopy(queue.allowance, left) : null;
  const uploading = files.filter((f) => !f.error && (f.total == null || f.uploaded < f.total));
  const handoff = `${origin}${a}/logbooks/add?book=${target?.type ?? "airframe"}&vol=${target?.id ?? ""}&capture=1`;
  const nothing = !device && !uploading.length && !dups.length && t && !t.queued && !t.reading && !t.waitingAllowance && !t.failed && !waitingForYou;

  return (
    <Leaves split="1.25fr 1fr">
      <Leaf label="Add pages">
        {!online && (
          <p className="mb-4 rounded-[2px] bg-alarm-bg px-3.5 py-2.5 text-[16px] font-semibold text-on-alarm-bg">
            You&apos;re offline. Pages are kept on this device and upload when you reconnect.
          </p>
        )}
        <section aria-labelledby="land-title">
          <h2 id="land-title" className="text-section">Where the new pages land</h2>
          <p className="text-small text-ink-3">
            {span ? `${span.from} to ${span.to}` : "Pages land on the map by the dates the reader finds."} · <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block size-[9px] rounded-full border-2 border-dotted border-ink-3" /> read, not confirmed</span>
          </p>
          {map && <div className="mt-2 -mx-2">{map}</div>}
        </section>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 border-t-2 border-ink pt-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <label className="grid gap-1 text-label">
              Into
              <select value={vol} onChange={(e) => setVol(e.target.value)} className="h-[42px] min-w-[220px] rounded-control border border-control-border bg-leaf px-3 text-body text-ink">
                {volumes.map((v) => <option key={v.id} value={v.id}>{v.label} · {plural(v.pages, "page")}</option>)}
              </select>
            </label>
            <fieldset className="grid gap-1">
              <legend className="text-label">Place them</legend>
              <div className="flex items-center gap-2">
                <div role="radiogroup" className="inline-flex rounded-control border border-control-border">
                  {(["end", "after"] as const).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={place === k} onClick={() => { setPlace(k); if (k === "after" && !after) setAfter(target?.lastSeq ?? 0); }}
                      className={`state-layer h-[40px] px-3.5 text-button-s ${place === k ? "bg-ink text-leaf" : "text-ink"} first:rounded-l-control last:rounded-r-control`}>
                      {k === "end" ? "At the end" : "After page"}
                    </button>
                  ))}
                </div>
                {place === "after" && (
                  <input type="number" min={0} max={target?.lastSeq ?? 0} value={after} aria-label="After page number"
                    onChange={(e) => setAfter(Math.max(0, Math.min(target?.lastSeq ?? 0, Number(e.target.value) || 0)))}
                    className="h-[40px] w-20 rounded-control border border-control-border bg-leaf px-2 text-body text-ink" />
                )}
              </div>
            </fieldset>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDrag("zone"); }}
            onDragLeave={() => setDrag("window")}
            onDrop={(e) => { e.preventDefault(); setDrag(null); void addFiles(e.dataTransfer.files); }}
            className={`grid min-h-[180px] content-center justify-items-center gap-1.5 rounded-m border-2 px-6 py-7 text-center ${drag ? "border-solid border-ink" : "border-dashed border-rule-2"} bg-leaf-2`}
          >
            <p className="flex items-center gap-2 text-[17px] font-bold">
              <Upload aria-hidden size={18} />
              {drag === "zone" ? `Drop to add to ${target?.label}` : "Drop PDFs or photos here"}
            </p>
            <p className="text-small text-ink-3">
              or{" "}
              <button type="button" onClick={() => input.current?.click()} className="font-semibold text-board-ink underline decoration-dotted">
                choose files
              </button>
              . Long PDFs are split into pages, in order.
            </p>
            <p className="text-caption text-ink-3">PDF, JPEG, PNG and iPhone HEIC</p>
            <input ref={input} type="file" multiple accept=".pdf,image/*,.heic,.heif" className="sr-only" tabIndex={-1} aria-hidden
              onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
            {skipped.length > 0 && (
              <p className="mt-1 rounded-[2px] bg-alarm-bg px-3 py-1.5 text-small font-semibold text-on-alarm-bg">{skipped.join(" ")}</p>
            )}
          </div>

          <label className="flex items-start gap-3">
            <input type="checkbox" checked={handwritten} onChange={(e) => setHandwritten(e.target.checked)} className="mt-1 size-[18px]" />
            <span>
              <span className="text-body-strong">Handwritten pages</span>
              <span className="block text-small text-ink-3">Read by the handwriting model. Turn off for typed or printed pages.</span>
            </span>
          </label>

          {camera ? (
            <CameraCapture onQueue={queuePage} onDone={async (batchId, n) => {
              setCamera(false);
              if (!n) return;
              setFiles((fs) => [{ batchId, name: "Photos from this device", total: n, uploaded: 0 }, ...fs]);
              sessions.current.set(batchId, { logbookId: target.id, after: place === "after" ? after : null, ids: [], total: n });
              await setBatchExpected(batchId, n);
              void registerBackgroundDrain();
              await drainAll();
            }} onShot={refreshDevice} />
          ) : (
            <div>
              <Button onClick={() => setCamera(true)}><Camera aria-hidden size={18} /> Take photos with this device</Button>
            </div>
          )}

          <section aria-labelledby="phone-title" className="rounded-[var(--radius-s)] bg-leaf-2 px-4 py-3.5">
            <h3 id="phone-title" className="text-body-strong">Or scan with your phone</h3>
            <p className="mt-1 text-small text-ink-2">
              Scan the code or open this link on your phone. It opens the scanner on this logbook, and every page you photograph joins the queue and lands on the map.
              Works without signal. Pages wait on the phone and upload later.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Qr value={handoff} size={120} label="QR code: scan it with your phone's camera to open the scanner on this logbook" />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                <code className="w-full truncate rounded-[var(--radius-s)] bg-leaf px-2 py-1.5 text-caption">{handoff}</code>
                <Button size="s" onClick={() => { void navigator.clipboard?.writeText(handoff).then(() => setCopied(true)); }}>
                  <Copy aria-hidden size={16} /> {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </Leaf>

      <Leaf label="The queue">
        <h2 className="text-heading">The queue</h2>
        <p className="text-small text-ink-3">Carries on if you leave this page</p>
        <p aria-live="polite" className="sr-only">
          {t?.reading ? `Reading page ${Math.min(readingOf, readSoFar + 1)} of ${readingOf}` : ""}
        </p>
        {queueErr && <p role="alert" className="mt-3 text-small font-semibold text-alarm-text">Couldn&apos;t check the queue. Trying again.</p>}
        <div className="mt-3">
          {nothing && <p className="py-3 text-body text-ink-2">Nothing in the queue.</p>}
          {device > 0 && (
            <HungSection title="On this device" count={plural(device, "page")} first>
              <p className="flex items-center gap-2 text-body"><CloudUpload aria-hidden size={16} /> They upload when you&apos;re online.</p>
            </HungSection>
          )}
          {files.length > 0 && (
            <HungSection title={uploading.length ? "Uploading" : "Uploaded"} first={!device}>
              <ul className="space-y-2.5">
                {files.slice(0, 8).map((f) => (
                  <li key={f.batchId}>
                    {f.error ? (
                      <p className="text-small font-semibold text-alarm-text">{f.error}</p>
                    ) : (
                      <>
                        <div className="flex justify-between gap-3 text-[15px]">
                          <span className="min-w-0 truncate">
                            {f.total == null ? `${f.name} · splitting into pages` : `${f.name} split into ${plural(f.total, "page")}`}
                          </span>
                          <span className="shrink-0 text-ink-3">{f.total == null ? "…" : `${f.uploaded} of ${f.total}`}</span>
                        </div>
                        <Progress value={f.uploaded} max={f.total ?? 1} text={`${f.uploaded} of ${f.total ?? "?"} pages uploaded`} />
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {lowQuality > 0 && <p className="mt-2 text-small text-ink-2">{lowQuality === 1 ? "1 page looks low quality. It'll still be read." : `${plural(lowQuality, "page")} look low quality. They'll still be read.`}</p>}
            </HungSection>
          )}
          {dups.length > 0 && (
            <HungSection title="Already have it?" count={`${dups.length}`}>
              <p className="text-body">{dups.length === 1 ? "1 page looks like one you already have." : `${plural(dups.length, "page")} look like pages you already have.`}</p>
              <ul className="mt-2 space-y-3">
                {dups.map((d) => <Duplicate key={d.pageId} d={d} onDone={poll} />)}
              </ul>
            </HungSection>
          )}
          {t && t.queued > 0 && (
            <HungSection title="Waiting to be read" count={plural(t.queued, "page")}>
              <p className="text-body text-ink-2">The reader takes them in order, a few at a time.</p>
            </HungSection>
          )}
          {t && t.reading > 0 && (
            <HungSection title="Being read" count={plural(t.reading, "page")}>
              <p className="text-body">{readSoFar} of {readingOf} read so far.</p>
            </HungSection>
          )}
          {t && t.waitingAllowance > 0 && queue && (
            <HungSection title="Waiting for tomorrow" count={plural(t.waitingAllowance, "page")}>
              <p className="text-body">
                {plural(t.waitingAllowance, "page")} wait for tomorrow&apos;s allowance{queue.allowance.nextFreeAt ? `, from about ${time(queue.allowance.nextFreeAt)}` : ""}.
              </p>
              <Link href="/account/settings#ai" className="text-small font-semibold text-board-ink underline decoration-dotted">Add your own key</Link>
            </HungSection>
          )}
          {waitingForYou > 0 && (
            <HungSection title="Waiting for you" count={plural(waitingForYou, "page")}>
              {t?.lastRead && (
                <p className="text-body">
                  Scanned {day(t.lastRead.createdAt)}. {t.lastRead.clean} read cleanly, {t.lastRead.doubtful} {t.lastRead.doubtful === 1 ? "has" : "have"} a doubtful date or tach.
                </p>
              )}
              <div className="mt-2"><Button variant="primary" href={`${a}/logbooks/review`}>Review {plural(waitingForYou, "page")}</Button></div>
            </HungSection>
          )}
          {t && t.failed > 0 && (
            <HungSection title="Couldn't be read" count={plural(t.failed, "page")}>
              <p className="text-body">{plural(t.failed, "page")} couldn&apos;t be read. The page shows the reason.</p>
              <Button size="s" href={`${a}/logbooks/pages?state=failed`}>Read again</Button>
            </HungSection>
          )}
          {queue && allow && (
            <HungSection title="Reading today" first={!!nothing}>
              <div className="flex justify-between text-[15px]">
                <span><strong>{allow.head}</strong></span>
                <span className="text-ink-3">{allow.source}</span>
              </div>
              <Progress value={queue.allowance.pagesUsedApprox} max={queue.allowance.pagesCapApprox} text={`${queue.allowance.pagesUsedApprox} of ${queue.allowance.pagesCapApprox} pages used today`} />
              <p className="mt-1.5 text-small text-ink-3">
                {allow.note}
                {allow.over && <> <Link href="/account/settings#ai" className="font-semibold text-board-ink underline decoration-dotted">Add your own key</Link></>}
              </p>
              <p className="mt-2 text-small text-ink-3">We&apos;ll tell you here and by email when these are read.</p>
            </HungSection>
          )}
        </div>
        {toast && (
          <div role="status" className="fixed right-6 bottom-6 z-40 flex items-center gap-3 rounded-[3px] bg-ink py-2.5 pr-2.5 pl-4 text-[15px] text-leaf shadow-leaf">
            {toast.text}
            <Link href={`${a}/logbooks/review?batch=${toast.batchId}`} className="font-semibold underline">Review</Link>
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="p-1"><X aria-hidden size={16} /></button>
          </div>
        )}
      </Leaf>
    </Leaves>
  );
}

/** ProgressBar (02 §5.16): determinate, ink on leaf-2. */
function Progress({ value, max, text }: { value: number; max: number; text: string }) {
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-valuetext={text}
      className="mt-1 h-2.5 overflow-hidden rounded-[1px] bg-leaf-2 shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <div className="h-full bg-ink" style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} />
    </div>
  );
}

/** One "Already have it?" pair: both thumbnails, Keep both / Skip this one (09 §3.9.3). */
function Duplicate({ d, onDone }: { d: DuplicatePair; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (decision: "keep_both" | "skip") => {
    setBusy(true);
    const res = await fetch(`/api/pages/${d.pageId}/duplicate-decision`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setErr("Couldn't save that. Try again.");
    onDone();
  };
  return (
    <li className="grid grid-cols-[auto_auto_1fr] items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated thumbnail route */}
      <img src={`/api/page/${d.pageId}/image?thumb=1`} alt="The new page" className="h-[58px] w-[42px] rounded-[2px] bg-leaf-2 object-cover" />
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated thumbnail route */}
      <img src={`/api/page/${d.of.pageId}/image?thumb=1`} alt={`${d.of.label}, already scanned`} className="h-[58px] w-[42px] rounded-[2px] bg-leaf-2 object-cover" />
      <div className="min-w-0">
        <p className="text-small">{d.of.label}, scanned {new Date(d.of.scannedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</p>
        <div className="mt-1 flex gap-2">
          <Button size="s" disabled={busy} onClick={() => decide("keep_both")}>Keep both</Button>
          <Button size="s" disabled={busy} onClick={() => decide("skip")}>Skip this one</Button>
        </div>
        {err && <p role="alert" className="text-small text-alarm-text">{err}</p>}
      </div>
    </li>
  );
}

/**
 * CameraCapture (W-BOOKS-06): live preview, shutter, the size / blur / glare check with its three reasons, and
 * Retake / Keep it anyway. Shots queue on the device as one batch; "Done" says how many, then they upload.
 */
function CameraCapture({
  onQueue, onDone, onShot,
}: {
  onQueue: (blob: Blob, report: QualityReport, batch: QueuedPage["batch"]) => Promise<void>;
  onDone: (batchId: string, n: number) => void;
  onShot: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [batchId] = useState(() => crypto.randomUUID());
  const [count, setCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [held, setHeld] = useState<{ url: string; blob: Blob; report: QualityReport; problem: string } | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setErr("The camera isn't available. Allow camera access, or choose files instead."));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const keep = async (blob: Blob, report: QualityReport) => {
    await onQueue(blob, report, { id: batchId, source: "web_camera", expectedPages: null });
    setCount((n) => n + 1);
    onShot();
  };

  const shoot = async () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const report = assessQuality(c);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return setErr("Couldn't take that photo. Try again.");
    const problem = shotProblem(report);
    if (problem) setHeld({ url: URL.createObjectURL(blob), blob, report, problem });
    else await keep(blob, report);
  };

  const release = () => setHeld((h) => { if (h) URL.revokeObjectURL(h.url); return null; });

  return (
    <section aria-label="Camera" className="rounded-leaf bg-mat p-3.5 text-on-cover">
      <div className="mb-2 flex items-center justify-between text-small">
        <span>Page {count + 1}</span>
        <span className="text-on-cover-2">{count ? `${plural(count, "page")} taken` : "Fill the frame with one page"}</span>
      </div>
      <div className="relative mx-auto aspect-[3/4] max-h-[60dvh] overflow-hidden rounded-[2px] bg-cover">
        <video ref={video} autoPlay playsInline muted className={`size-full object-cover ${held ? "hidden" : ""}`} />
        {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the shot */}
        {held && <img src={held.url} alt="The shot you just took" className="size-full object-contain" />}
      </div>
      {err && <p role="alert" className="mt-2 text-small">{err}</p>}
      {held ? (
        <div className="mt-3">
          <p role="alert" className="text-body">{held.problem}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="on-board" onClick={release}>Retake</Button>
            <Button variant="on-mat" onClick={async () => { const h = held; release(); await keep(h.blob, h.report); }}>Keep it anyway</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between">
          <Button variant="on-mat" onClick={() => onDone(batchId, count)}>Done</Button>
          <button type="button" onClick={shoot} aria-label={`Take page ${count + 1}`}
            className="state-layer size-16 rounded-full border-4 border-on-cover bg-on-cover/20" />
          <span className="w-[72px]" />
        </div>
      )}
    </section>
  );
}
