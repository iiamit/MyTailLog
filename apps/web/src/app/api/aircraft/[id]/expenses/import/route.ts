import { ownerJson } from "@/lib/owner/body";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ownerAccess, ownerError } from "@/lib/owner/access";
import { expenseInput, parseCsv } from "@/lib/owner/validation";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    a = await ownerAccess(req, id, "owner");
  if (a.response) return a.response;
  try {
    const b = await ownerJson(req, 2_100_000);
    if (typeof b.csv !== "string") throw new Error("Attach a CSV export.");
    const rows = parseCsv(b.csv).map((r, index) => {
      const hash = createHash("sha256")
        .update(`${id}:${b.csv}:${index}`)
        .digest("hex");
      return {
        ...expenseInput({
          ...r,
          id:
            r.id ||
            `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
          amount_minor: Number(r.amount_minor),
        }),
        aircraft_id: id,
      };
    });
    if (!rows.length) throw new Error("The CSV contains no expenses.");
    const { error } = await a.supabase.rpc("import_aircraft_expenses", {
      p_aircraft: id,
      p_rows: rows,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, count: rows.length });
  } catch (e) {
    return ownerError(e);
  }
}
