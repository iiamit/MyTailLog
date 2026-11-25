"use client";
import { Leaves, Leaf } from "@/ui/Board";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Expense } from "@/lib/owner/contracts";
import { CURRENCIES, currencyDigits, moneyMinor } from "@/lib/owner/validation";
import { Button } from "@/ui/Button";
import { fieldClass } from "@/ui/Form";
type Costs = {
  expenses: Expense[];
  entries: { id: string; date: string | null; description: string }[];
  documents: { id: string; title: string }[];
  totals: {
    currency: string;
    actual_minor: number;
    reserve_minor: number;
    actual_per_hour_minor: number | null;
  }[];
  denominator: { hours: number | null; source: string; coverage: string };
};
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    minor / 10 ** currencyDigits(currency),
  );
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init),
    body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error ?? "Could not save. Your draft is kept; try again.",
    );
  return body;
}
export function CostsClient({ aircraftId }: { aircraftId: string }) {
  const endpoint = `/api/aircraft/${aircraftId}/expenses`,
    [data, setData] = useState<Costs | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [period, setPeriod] = useState(""),
    [editing, setEditing] = useState<Expense | null>(null),
    [currency, setCurrency] = useState("USD"),
    [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const load = useCallback(async () => {
    setData(await request<Costs>(`${endpoint}${period}`));
  }, [endpoint, period]);
  useEffect(() => {
    const controller = new AbortController();
    request<Costs>(`${endpoint}${period}`, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [endpoint, period]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const payload = {
        id: editing?.id ?? draftId,
        ...Object.fromEntries(f),
        currency,
        amount_minor: moneyMinor(String(f.get("amount")), currency),
        ...(editing ? { base: editing.updated_at } : {}),
      };
      await request(editing ? `${endpoint}/${editing.id}` : endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      setEditing(null);
      setDraftId(crypto.randomUUID());
      form.reset();
      await load();
      setError("Expense saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: Expense) {
    if (
      !window.confirm(
        `Delete ${money(row.amount_minor, row.currency)} from ${row.date}?`,
      )
    )
      return;
    setBusy(true);
    try {
      await request(
        `${endpoint}/${row.id}?base=${encodeURIComponent(row.updated_at)}`,
        { method: "DELETE" },
      );
      await load();
      setError("Expense deleted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importCsv(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem("csv") as HTMLInputElement)
      .files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 2_000_000) throw new Error("CSV too large (max 2 MB).");
      const result = await request<{ count: number }>(`${endpoint}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: await file.text() }),
      });
      await load();
      setError(
        `${result.count} rows accepted. Re-importing the same file does not duplicate expenses.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Leaves>
      <Leaf label="Ownership cost ledger" className="space-y-6">
        <h2 className="text-xl font-semibold">Ownership costs</h2>
        <p>
          Private to the aircraft owner. Recorded spending and reserve estimates
          are separate; currencies are never combined.
        </p>
        <p role="status" aria-live="polite">
          {error}
        </p>
        <form
          aria-label="Reporting period"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from > to) {
              setError("Choose an end date on or after the start date.");
              return;
            }
            const nextPeriod = `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`;
            if (nextPeriod !== period) {
              setData(null);
              setError("");
              setPeriod(nextPeriod);
            }
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label>
            From
            <input
              name="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label>
            Through
            <input
              name="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={fieldClass}
            />
          </label>
          <Button type="submit" variant="quiet" disabled={busy}>
            Apply period
          </Button>
          <a
            className="p-3 underline"
            href={`${endpoint}${period ? `${period}&` : "?"}format=csv`}
          >
            Export CSV
          </a>
        </form>
        <div className="grid gap-3 sm:grid-cols-2">
          {data?.totals.map((t) => (
            <div key={t.currency} className="border-b border-rule py-4">
              <h3 className="font-semibold">{t.currency}</h3>
              <p>Recorded spending: {money(t.actual_minor, t.currency)}</p>
              <p>Reserve estimates: {money(t.reserve_minor, t.currency)}</p>
              {t.actual_per_hour_minor != null && (
                <p>
                  Recorded spending per measured hour:{" "}
                  {money(t.actual_per_hour_minor, t.currency)}
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="text-sm text-ink-2">
          {data?.denominator.hours
            ? `${data.denominator.hours} measured hours. `
            : "Cost per hour is not calculated: "}
          {data?.denominator.source ?? "period usage has not been verified"}.
          Meter-face differences across replacements are not a usage
          denominator.
        </p>
        <section className="min-w-0">
          <h3 className="mb-3 text-lg font-semibold">Expenses</h3>
          {data?.expenses.length === 0 && <p>No expenses in this period.</p>}
          <ul className="space-y-3">
            {data?.expenses.map((row) => (
              <li key={row.id} className="border-b border-rule py-3">
                <strong>{money(row.amount_minor, row.currency)}</strong> ·{" "}
                {row.date}
                <p>
                  {row.vendor ?? row.category} · {row.cost_type} ·{" "}
                  {row.basis === "reserve"
                    ? "reserve estimate"
                    : "actual spending"}
                </p>
                {row.notes && <p className="break-words">{row.notes}</p>}
                {row.inbox_id && (
                  <a
                    className="block underline"
                    href={`/api/aircraft/${aircraftId}/inbox/${row.inbox_id}/file`}
                  >
                    Original invoice
                  </a>
                )}
                {row.document_id && (
                  <a
                    className="block underline"
                    href={`/aircraft/${aircraftId}/documents?doc=${row.document_id}`}
                  >
                    Linked document
                  </a>
                )}
                {row.log_entry_id && (
                  <a
                    className="block underline"
                    href={`/aircraft/${aircraftId}/logbooks/entries/${row.log_entry_id}`}
                  >
                    Maintenance entry
                  </a>
                )}
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => {
                    setEditing(row);
                    setCurrency(row.currency);
                  }}
                  disabled={busy}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => void remove(row)}
                  disabled={busy}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </section>{" "}
        <details>
          <summary className="cursor-pointer py-3 font-semibold">
            Import expenses from CSV
          </summary>
          <p>
            Required columns: date, currency, amount_minor, category, cost_type,
            basis. Optional: id, vendor, payer, notes, document_id,
            log_entry_id. Use minor units (USD 125.50 = 12550; JPY 125 = 125;
            KWD 1.250 = 1250). Export a CSV above for the exact format.
          </p>
          <form
            onSubmit={importCsv}
            aria-label="Import expenses"
            className="space-y-3"
          >
            <label className="block">
              CSV file (up to 500 rows)
              <input
                type="file"
                name="csv"
                accept="text/csv,.csv"
                required
                className={fieldClass}
              />
            </label>
            <Button type="submit" disabled={busy}>
              Validate and import CSV
            </Button>
          </form>
        </details>
        <a className="block underline" href={`/aircraft/${aircraftId}/inbox`}>
          Upload an invoice to the document inbox
        </a>
      </Leaf>
      <Leaf label="Expense details">
        {" "}
        <section>
          <h3 id="expense-heading" className="mb-3 text-lg font-semibold">
            {editing ? "Edit expense" : "Add expense"}
          </h3>
          <form
            key={editing?.id ?? draftId}
            onSubmit={save}
            aria-labelledby="expense-heading"
            className="space-y-3"
          >
            <label className="block">
              Date
              <input
                name="date"
                type="date"
                required
                defaultValue={
                  editing?.date ?? new Date().toISOString().slice(0, 10)
                }
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
              Amount (negative for a refund)
              <input
                name="amount"
                inputMode="decimal"
                required
                defaultValue={
                  editing
                    ? (
                        editing.amount_minor /
                        10 ** currencyDigits(editing.currency)
                      ).toFixed(currencyDigits(editing.currency))
                    : ""
                }
                className={fieldClass}
              />
            </label>
            <label className="block">
              Category
              <select
                name="category"
                defaultValue={editing?.category ?? "maintenance"}
                className={fieldClass}
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
            <fieldset>
              <legend>Cost type</legend>
              <label className="mr-4 inline-block py-2">
                <input
                  name="cost_type"
                  type="radio"
                  value="variable"
                  defaultChecked={editing?.cost_type !== "fixed"}
                />{" "}
                Variable
              </label>
              <label className="inline-block py-2">
                <input
                  name="cost_type"
                  type="radio"
                  value="fixed"
                  defaultChecked={editing?.cost_type === "fixed"}
                />{" "}
                Fixed
              </label>
            </fieldset>
            <fieldset>
              <legend>Record as</legend>
              <label className="mr-4 inline-block py-2">
                <input
                  name="basis"
                  type="radio"
                  value="actual"
                  defaultChecked={editing?.basis !== "reserve"}
                />{" "}
                Actual spending
              </label>
              <label className="inline-block py-2">
                <input
                  name="basis"
                  type="radio"
                  value="reserve"
                  defaultChecked={editing?.basis === "reserve"}
                />{" "}
                Reserve estimate
              </label>
            </fieldset>
            <label className="block">
              Vendor
              <input
                name="vendor"
                maxLength={200}
                defaultValue={editing?.vendor ?? ""}
                className={fieldClass}
              />
            </label>
            <label className="block">
              Paid by
              <input
                name="payer"
                maxLength={200}
                defaultValue={editing?.payer ?? ""}
                className={fieldClass}
              />
            </label>
            <label className="block">
              Notes
              <textarea
                name="notes"
                maxLength={4000}
                defaultValue={editing?.notes ?? ""}
                className={fieldClass}
              />
            </label>
            <label className="block">
              Maintenance entry (optional)
              <select
                name="log_entry_id"
                defaultValue={editing?.log_entry_id ?? ""}
                className={fieldClass}
              >
                <option value="">No linked entry</option>
                {data?.entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.date ?? "Undated"} · {e.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Supporting document (optional)
              <select
                name="document_id"
                defaultValue={editing?.document_id ?? ""}
                className={fieldClass}
              >
                <option value="">No linked document</option>
                {data?.documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-3">
              <Button type="submit" disabled={busy || !draftId}>
                Save expense
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => setEditing(null)}
                >
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </section>
      </Leaf>
    </Leaves>
  );
}
