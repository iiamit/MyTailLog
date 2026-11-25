import type { OilAddition } from "@/lib/database.types";

/** Call only within one engine service period; never infer missing meter readings. */
export function engineConsumption(additions: OilAddition[]) {
  if (
    additions.length < 2 ||
    additions.some(
      (a) => !a.added_date || !Number.isFinite(a.quarts) || a.quarts <= 0,
    )
  )
    return null;
  const rows = [...additions].sort((a, b) =>
    a.added_date.localeCompare(b.added_date),
  );
  if (rows.some((r, i) => i > 0 && r.added_date === rows[i - 1].added_date))
    return null;
  for (const meter of ["tach", "hobbs"] as const) {
    if (
      rows.some(
        (r, i) =>
          r[meter] == null ||
          !Number.isFinite(r[meter]) ||
          (i > 0 && r[meter]! <= rows[i - 1][meter]!),
      )
    )
      continue;
    const hours = rows[rows.length - 1][meter]! - rows[0][meter]!;
    const quarts = rows.slice(1).reduce((sum, row) => sum + row.quarts, 0);
    return { meter, hours, quarts, hoursPerQuart: hours / quarts };
  }
  return null;
}
