import { parseCsv as parseTable, stripFormulaGuard } from "@/lib/csv/parse";
import type { Expense } from "./contracts";
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "AUD",
  "NZD",
  "CHF",
  "JPY",
  "CNY",
  "HKD",
  "SGD",
  "INR",
  "ZAR",
  "SEK",
  "NOK",
  "DKK",
  "AED",
  "ILS",
  "BRL",
  "MXN",
  "KWD",
  "BHD",
  "OMR",
];
export const currencyDigits = (currency: string) =>
  currency === "JPY" ? 0 : ["KWD", "BHD", "OMR"].includes(currency) ? 3 : 2;
export const isDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function moneyMinor(text: string, currency: string): number {
  const digits = currencyDigits(currency),
    match = text.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (
    !CURRENCIES.includes(currency) ||
    !match ||
    (match[3]?.length ?? 0) > digits
  )
    throw new Error("Enter a valid amount for this currency.");
  const n = Number(
    `${match[1]}${match[2]}${(match[3] ?? "").padEnd(digits, "0")}`,
  );
  if (!Number.isSafeInteger(n) || n === 0 || Math.abs(n) > 9_000_000_000_000)
    throw new Error("Amount is outside the supported range.");
  return n;
}
export function expenseInput(
  b: Record<string, unknown>,
): Omit<Expense, "aircraft_id" | "created_at" | "updated_at" | "inbox_id"> {
  if (
    !UUID.test(String(b.id)) ||
    !isDate(b.date) ||
    !CURRENCIES.includes(String(b.currency)) ||
    !Number.isSafeInteger(b.amount_minor) ||
    Number(b.amount_minor) === 0 ||
    Math.abs(Number(b.amount_minor)) > 9_000_000_000_000
  )
    throw new Error("Check the expense identifier, date, currency and amount.");
  if (
    !["maintenance", "fuel", "oil", "insurance", "hangar", "other"].includes(
      String(b.category),
    ) ||
    !["fixed", "variable"].includes(String(b.cost_type)) ||
    !["actual", "reserve"].includes(String(b.basis))
  )
    throw new Error(
      "Choose a category, cost type and actual spending or reserve.",
    );
  const text = (key: string, limit: number) => {
    const v = b[key];
    if (v == null || v === "") return null;
    if (typeof v !== "string" || v.length > limit)
      throw new Error(`Invalid ${key}.`);
    return v.trim() || null;
  };
  const ref = (key: string) => {
    const v = text(key, 36);
    if (v && !UUID.test(v)) throw new Error(`Invalid ${key}.`);
    return v;
  };
  return {
    id: String(b.id),
    date: b.date,
    currency: String(b.currency),
    amount_minor: Number(b.amount_minor),
    category: String(b.category),
    cost_type: b.cost_type as Expense["cost_type"],
    basis: b.basis as Expense["basis"],
    vendor: text("vendor", 200),
    notes: text("notes", 4000),
    payer: text("payer", 200),
    document_id: ref("document_id"),
    log_entry_id: ref("log_entry_id"),
  };
}
export function expenseTotals(
  rows: Pick<Expense, "currency" | "basis" | "amount_minor">[],
) {
  const totals = new Map<
    string,
    { currency: string; actual_minor: number; reserve_minor: number }
  >();
  for (const r of rows) {
    const t = totals.get(r.currency) ?? {
      currency: r.currency,
      actual_minor: 0,
      reserve_minor: 0,
    };
    t[r.basis === "actual" ? "actual_minor" : "reserve_minor"] +=
      r.amount_minor;
    if (
      !Number.isSafeInteger(t.actual_minor) ||
      !Number.isSafeInteger(t.reserve_minor)
    )
      throw new Error("Total exceeds supported precision.");
    totals.set(r.currency, t);
  }
  return [...totals.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}
const csvCell = (v: unknown) => {const text=String(v??""),safe=typeof v==="number"?text:text.replace(/^[=+\-@\t\r]/,"'$&");return `"${safe.replaceAll('"','""')}"`;};
export function expensesCsv(rows: Expense[]) {
  const fields = [
    "id",
    "date",
    "currency",
    "amount_minor",
    "category",
    "cost_type",
    "basis",
    "vendor",
    "payer",
    "notes",
    "document_id",
    "log_entry_id",
  ] as const;
  return [
    fields.join(","),
    ...rows.map((r) => fields.map((k) => csvCell(r[k])).join(",")),
  ].join("\r\n");
}
export function parseCsv(text: string): Record<string, string>[] {
  if (text.length > 2_000_000) throw new Error("CSV too large (max 2 MB).");
  const { header: headers, rows } = parseTable(text, ",", true);
  if (
    !headers ||
    new Set(headers).size !== headers.length ||
    ![
      "date",
      "currency",
      "amount_minor",
      "category",
      "cost_type",
      "basis",
    ].every((k) => headers.includes(k))
  )
    throw new Error(
      "CSV needs date,currency,amount_minor,category,cost_type,basis columns.",
    );
  if (rows.length > 500)
    throw new Error("Import at most 500 expenses at a time.");
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) => {
      if (r.length !== headers.length)
        throw new Error("CSV column count differs from the header.");
      return Object.fromEntries(
        headers.map((k, i) => [k, stripFormulaGuard(r[i])]),
      );
    });
}
