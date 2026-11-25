"use client";
import { Leaves, Leaf } from "@/ui/Board";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  InboxItem,
  InboxKind,
  EngineHistory,
} from "@/lib/owner/contracts";
import {
  inboxUploads,
  saveInboxUpload,
  removeInboxUpload,
  type InboxUpload,
} from "@/lib/owner/uploadQueue";
import { CURRENCIES, currencyDigits, moneyMinor } from "@/lib/owner/validation";
import { rasterizeFile } from "@/lib/capture/importFiles";
import { fieldClass } from "@/ui/Form";
import { Button } from "@/ui/Button";
type Inbox = {
  items: InboxItem[];
  logbooks: { id: string; type: string }[];
  canEdit: boolean;
  canManageFinances: boolean;
};
const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init),
    b = await r.json();
  if (!r.ok)
    throw new Error(
      b.error ?? "Request failed. Your draft is kept; try again.",
    );
  return b;
}
export function InboxClient({ aircraftId }: { aircraftId: string }) {
  const endpoint = `/api/aircraft/${aircraftId}/inbox`,
    [data, setData] = useState<Inbox>({
      items: [],
      logbooks: [],
      canEdit: false,
      canManageFinances: false,
    }),
    [selected, setSelected] = useState<string | null>(null),
    [pending, setPending] = useState<InboxUpload[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [engines, setEngines] = useState<EngineHistory["components"]>([]);
  const draining = useRef(false);
  const load = useCallback(async () => {
    setData(await json<Inbox>(endpoint));
    setPending(
      (await inboxUploads()).filter((x) => x.aircraftId === aircraftId),
    );
  }, [endpoint, aircraftId]);
  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      for (const upload of (await inboxUploads()).filter(
        (x) => x.aircraftId === aircraftId,
      )) {
        setMessage(`Uploading ${upload.file.name}…`);
        const form = new FormData();
        form.set("id", upload.id);
        form.set("file", upload.file);
        try {
          const result = await json<{ item: InboxItem; duplicate?: boolean }>(
            endpoint,
            { method: "POST", body: form },
          );
          await removeInboxUpload(upload.id);
          setSelected(result.item.id);
          setMessage(
            result.duplicate
              ? "This file is already in the inbox. No duplicate was added."
              : "Original saved. Review its destination before adding records.",
          );
        } catch (e) {
          setMessage((e as Error).message);
          break;
        }
      }
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      draining.current = false;
    }
  }, [aircraftId, endpoint, load]);
  useEffect(() => {
    const controller = new AbortController();
    json<Inbox>(endpoint, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setMessage(e.message);
      });
    inboxUploads()
      .then((rows) => {
        if (!controller.signal.aborted)
          setPending(rows.filter((x) => x.aircraftId === aircraftId));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setMessage(e.message);
      });
    json<EngineHistory>(`/api/aircraft/${aircraftId}/engine-history`, {
      signal: controller.signal,
    })
      .then((x) => setEngines(x.components))
      .catch(() => {});
    const online = () => void drain();
    window.addEventListener("online", online);
    inboxUploads()
      .then((rows) => {
        if (
          !controller.signal.aborted &&
          rows.some((x) => x.aircraftId === aircraftId)
        )
          void drain();
      })
      .catch(() => {});
    return () => {
      controller.abort();
      window.removeEventListener("online", online);
    };
  }, [endpoint, drain, aircraftId]);
  const item = data.items.find((x) => x.id === selected);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      files = (form.elements.namedItem("files") as HTMLInputElement).files;
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024)
          throw new Error(`${file.name} exceeds 25 MB.`);
        await saveInboxUpload({
          id: crypto.randomUUID(),
          aircraftId,
          file,
          createdAt: Date.now(),
        });
      }
      form.reset();
      await drain();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Leaves>
      <Leaf label="Your document inbox" className="space-y-5">
        <p>
          Upload logbook pages, invoices or oil reports. Originals are retained;
          suggestions do not change records until you approve them. Invoices
          stay private to the aircraft owner.
        </p>
        <div role="status" aria-live="polite">
          {message}
        </div>
        {data.canEdit && (
          <form
            onSubmit={upload}
            aria-label="Upload documents"
            className="space-y-3"
          >
            <label className="block" htmlFor="inbox-files">
              PDFs or images, up to 25 MB each
            </label>
            <input
              id="inbox-files"
              name="files"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              required
              className={fieldClass}
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Upload documents"}
            </Button>
          </form>
        )}
        {pending.length > 0 && (
          <p>
            {pending.length} upload(s) saved on this browser, waiting to finish.{" "}
            <Button variant="quiet" onClick={() => void drain()}>
              Retry uploads
            </Button>
          </p>
        )}

        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Your inbox</h2>
          {!data.items.length && (
            <p>No documents yet. Add a file above to get started.</p>
          )}
          {data.items.map((row) => (
            <button
              type="button"
              key={row.id}
              onClick={() => setSelected(row.id)}
              aria-pressed={selected === row.id}
              className="block w-full rounded border border-rule p-3 text-left"
            >
              <strong className="break-words">{row.file_name}</strong>
              <span className="block text-ink-2">
                {row.kind.replaceAll("_", " ")} · {row.state}
              </span>
              {row.error && <span className="block">{row.error}</span>}
            </button>
          ))}
        </div>
      </Leaf>
      <Leaf label="Review document">
        {item ? (
          <InboxReview
            key={`${item.id}:${item.updated_at}`}
            item={item}
            books={data.logbooks}
            engines={engines}
            endpoint={endpoint}
            canFinance={data.canManageFinances}
            onSaved={async () => load()}
            onMessage={setMessage}
          />
        ) : (
          <p className="text-ink-2">
            Select a document to review its destination and suggested details.
          </p>
        )}
      </Leaf>
    </Leaves>
  );
}
function InboxReview({
  item,
  books,
  engines,
  endpoint,
  canFinance,
  onSaved,
  onMessage,
}: {
  item: InboxItem;
  books: Inbox["logbooks"];
  engines: EngineHistory["components"];
  endpoint: string;
  canFinance: boolean;
  onSaved: () => Promise<void>;
  onMessage: (s: string) => void;
}) {
  const [kind, setKind] = useState<InboxKind>(item.kind),
    [proposal, setProposal] = useState(item.proposal),
    [busy, setBusy] = useState(false),
    [currency, setCurrency] = useState(String(item.proposal.currency || "USD"));
  const amount =
    typeof proposal.amount_minor === "number"
      ? (proposal.amount_minor / 10 ** currencyDigits(currency)).toFixed(
          currencyDigits(currency),
        )
      : "";
  const samples = Array.isArray(proposal.samples)
    ? (proposal.samples as Record<string, unknown>[])
    : [];
  const changeSample = (index: number, key: string, value: unknown) =>
    setProposal({
      ...proposal,
      samples: samples.map((s, i) =>
        i === index ? { ...s, [key]: value } : s,
      ),
    });
  async function analyze() {
    setBusy(true);
    try {
      await json(`${endpoint}/${item.id}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      await onSaved();
      onMessage(
        "Suggestions are ready. Check them against the original before approving.",
      );
    } catch (e) {
      // The failed analysis releases its lease and advances the review version.
      await onSaved();
      onMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function approve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fields = new FormData(e.currentTarget);
    try {
      let current = item;
      let pageCount = item.rendered_pages.length;
      const p = { ...proposal };
      if (kind === "invoice") {
        Object.assign(p, {
          date: fields.get("date"),
          currency,
          amount_minor: moneyMinor(String(fields.get("amount")), currency),
          vendor: fields.get("vendor"),
          notes: fields.get("notes"),
          category: fields.get("category"),
          cost_type: fields.get("cost_type"),
          basis: "actual",
        });
      }
      if (kind === "logbook" && item.mime_type === "application/pdf") {
        const response = await fetch(`${endpoint}/${item.id}/file`);
        if (!response.ok)
          throw new Error("Could not download the original. Retry shortly.");
        const file = new File([await response.blob()], item.file_name, {
          type: item.mime_type,
        });
        pageCount = await rasterizeFile(file, async (page, index, total) => {
          if (current.rendered_pages.some((p) => p.index === index)) return;
          if (total > 500)
            throw new Error(
              "Split PDFs larger than 500 pages before importing.",
            );
          onMessage(`Preparing page ${index} of ${total}…`);
          const result = await json<{ item: InboxItem }>(
            `${endpoint}/${item.id}/pages`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ index, image: await base64(page.blob) }),
            },
          );
          current = result.item;
        });
      }
      await json(`${endpoint}/${item.id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          base: current.updated_at,
          kind,
          proposal: p,
          logbookId: fields.get("logbook"),
          componentId: fields.get("engine") || null,
          pageCount,
        }),
      });
      await onSaved();
      onMessage(
        "Approved. Logbook pages will be read for review; no extracted maintenance entry is automatically confirmed.",
      );
    } catch (e) {
      onMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="min-w-0 space-y-4" aria-label="Review document">
      <h2 className="text-xl font-semibold break-words">{item.file_name}</h2>
      <a href={`${endpoint}/${item.id}/file`} className="underline">
        Open original
      </a>
      {item.state === "approved" ? (
        <>
          <p>
            Approved as {item.kind.replaceAll("_", " ")}. Original retained.
          </p>
          {item.document_id && (
            <a
              className="block underline"
              href={`/aircraft/${item.aircraft_id}/documents?doc=${item.document_id}`}
            >
              Open the retained original in Documents
            </a>
          )}
          {item.kind === "invoice" && (
            <a
              className="block underline"
              href={`/aircraft/${item.aircraft_id}/costs`}
            >
              View the expense
            </a>
          )}
          {item.kind === "logbook" && (
            <a
              className="block underline"
              href={`/aircraft/${item.aircraft_id}/logbooks/pages`}
            >
              Review the uploaded logbook pages
            </a>
          )}
          {item.kind === "oil_report" && (
            <a
              className="block underline"
              href={`/aircraft/${item.aircraft_id}/engine-history`}
            >
              View engine history
            </a>
          )}
        </>
      ) : (
        <>
          <Button variant="quiet" onClick={analyze} disabled={busy}>
            Read and suggest a destination
          </Button>
          <p className="text-sm text-ink-2">
            Uses your configured AI allowance. You can choose the destination
            yourself instead.
          </p>
          <form
            onSubmit={approve}
            aria-label="Review destination"
            className="space-y-4"
          >
            <fieldset>
              <legend>Where should this go?</legend>
              {(
                [
                  ["logbook", "Logbook pages"],
                  ["invoice", "Private expense"],
                  ["oil_report", "Oil analysis"],
                  ["unclassified", "Documents only"],
                ] as const
              ).map(([value, label]) => (
                <label className="block py-2" key={value}>
                  <input
                    type="radio"
                    name="destination"
                    value={value}
                    checked={kind === value}
                    onChange={() => setKind(value)}
                    disabled={value === "invoice" && !canFinance}
                  />{" "}
                  {label}
                </label>
              ))}
            </fieldset>
            {kind === "unclassified" && (
              <p>
                Documents are shared with everyone who has access to this
                aircraft. To keep an invoice private, choose Private expense or
                leave it in the inbox.
              </p>
            )}
            {kind === "logbook" && (
              <label className="block">
                Logbook
                <select
                  name="logbook"
                  className={fieldClass}
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose a logbook
                  </option>
                  {books.map((b) => (
                    <option value={b.id} key={b.id}>
                      {b.type}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {kind === "invoice" && (
              <>
                <p>
                  Invoice totals are saved once as actual spending. They do not
                  confirm maintenance compliance or expose the invoice to
                  viewers.
                </p>
                <label className="block">
                  Invoice date
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={String(proposal.date ?? "")}
                    className={fieldClass}
                  />
                </label>
                <label className="block">
                  Currency
                  <select
                    name="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className={fieldClass}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Total (negative for refund)
                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    defaultValue={amount}
                    className={fieldClass}
                  />
                </label>
                <label className="block">
                  Vendor
                  <input
                    name="vendor"
                    maxLength={200}
                    defaultValue={String(proposal.vendor ?? "")}
                    className={fieldClass}
                  />
                </label>
                <label className="block">
                  Category
                  <select
                    name="category"
                    className={fieldClass}
                    defaultValue={String(proposal.category ?? "maintenance")}
                  >
                    {[
                      "maintenance",
                      "fuel",
                      "oil",
                      "insurance",
                      "hangar",
                      "other",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Cost type
                  <select name="cost_type" className={fieldClass}>
                    <option value="variable">Variable</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </label>
                <label className="block">
                  Notes
                  <textarea
                    name="notes"
                    maxLength={4000}
                    defaultValue={String(proposal.notes ?? "")}
                    className={fieldClass}
                  />
                </label>
              </>
            )}
            {kind === "oil_report" && (
              <>
                <label className="block">
                  Engine
                  <select name="engine" className={fieldClass}>
                    <option value="">
                      Unassigned — choose later if uncertain
                    </option>
                    {engines.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                        {c.position ? ` · ${c.position}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  Check every sample against the original. Identical samples for
                  the same engine and date are kept unchanged.
                </p>
                {samples.map((s, i) => (
                  <fieldset
                    key={i}
                    className="space-y-2 rounded border border-rule p-3"
                  >
                    <legend>Sample {i + 1}</legend>
                    <label className="block">
                      Sample date
                      <input
                        type="date"
                        required
                        value={String(s.sample_date ?? "")}
                        onChange={(e) =>
                          changeSample(i, "sample_date", e.target.value)
                        }
                        className={fieldClass}
                      />
                    </label>
                    {["oil_hours", "engine_hours", "oil_added_quarts"].map(
                      (key) => (
                        <label className="block" key={key}>
                          {key.replaceAll("_", " ")}
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={s[key] == null ? "" : String(s[key])}
                            onChange={(e) =>
                              changeSample(
                                i,
                                key,
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                            className={fieldClass}
                          />
                        </label>
                      ),
                    )}
                    {Object.entries(
                      (s.elements_ppm ?? {}) as Record<string, number>,
                    ).map(([element, value]) => (
                      <label key={element} className="block">
                        {element} (ppm)
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={value}
                          onChange={(e) =>
                            changeSample(i, "elements_ppm", {
                              ...(s.elements_ppm as object),
                              [element]: Number(e.target.value),
                            })
                          }
                          className={fieldClass}
                        />
                      </label>
                    ))}
                  </fieldset>
                ))}
                {!samples.length && (
                  <p>Use “Read and suggest” first to extract dated samples.</p>
                )}
              </>
            )}
            <Button
              type="submit"
              disabled={busy || (kind === "oil_report" && !samples.length)}
            >
              {busy ? "Working…" : "Approve and add"}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
