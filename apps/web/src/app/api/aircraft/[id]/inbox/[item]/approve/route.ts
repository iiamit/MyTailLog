import { ownerJson } from "@/lib/owner/body";
import sharp from "sharp";
import { checkOilProposal } from "@/lib/owner/oilProposal";
import { NextResponse } from "next/server";
import { ownerAccess, ownerError } from "@/lib/owner/access";
import { getBlob } from "@/lib/storage";
import { stagePage } from "@/lib/owner/inbox";
import { expenseInput, UUID } from "@/lib/owner/validation";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; item: string }> },
) {
  const { id, item } = await params,
    a = await ownerAccess(req, id, "edit");
  if (a.response) return a.response;
  try {
    const b = await ownerJson(req, 1_048_576);
    const { data: source, error: readError } = await a.supabase
      .from("aircraft_inbox")
      .select("*")
      .eq("id", item)
      .eq("aircraft_id", id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!source) return ownerError(new Error("Inbox item not found."), 404);
    if (source.state === "approved")
      return NextResponse.json({ item: source, replayed: true });
    if (typeof b.base !== "string" || b.base !== source.updated_at)
      return ownerError(
        new Error("This upload changed; reload before approving."),
        409,
      );
    let base = source.updated_at,
      count = Number(b.pageCount ?? 0);
    if (
      typeof b.kind !== "string" ||
      !["logbook", "invoice", "oil_report", "unclassified"].includes(b.kind)
    )
      throw new Error("Choose a valid destination.");
    if (!Number.isInteger(count) || count < 0 || count > 500)
      throw new Error("Check the rendered page count.");
    if (
      b.proposal != null &&
      (typeof b.proposal !== "object" || Array.isArray(b.proposal))
    )
      throw new Error("Review the proposed fields first.");
    const proposal = (b.proposal ?? source.proposal) as Record<string, unknown>;
    const ref = (value: unknown) => {
      if (value == null || value === "") return null;
      if (typeof value !== "string" || !UUID.test(value))
        throw new Error("Choose an engine and logbook on this aircraft.");
      return value;
    };
    const book = ref(b.logbookId),
      component = ref(b.componentId);
    if (b.kind === "oil_report") checkOilProposal(proposal);
    if (b.kind === "invoice") {
      if (a.aircraft.owner_id !== a.user.id)
        return ownerError(
          new Error("Only the owner can approve financial records."),
          403,
        );
      expenseInput({
        ...proposal,
        id: item,
        basis: "actual",
        cost_type: proposal.cost_type ?? "variable",
        category: proposal.category ?? "maintenance",
      });
    }
    if (
      b.kind === "logbook" &&
      source.mime_type !== "application/pdf" &&
      !source.rendered_pages.length
    ) {
      const blob = await getBlob(source.storage_path, id);
      if (!blob) throw new Error("Original is unavailable. Try again shortly.");
      const bytes = await sharp(blob.data, { limitInputPixels: 80_000_000 })
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 88 })
        .toBuffer();
      const staged = (await stagePage(a.supabase, id, item, 1, bytes)) as {
        updated_at: string;
      };
      base = staged.updated_at;
      count = 1;
    }
    const { data, error } = await a.supabase.rpc("approve_aircraft_inbox", {
      p_aircraft: id,
      p_id: item,
      p_base: base,
      p_kind: b.kind,
      p_book: book,
      p_component: component,
      p_proposal: proposal,
      p_count: count,
    });
    if (error)
      return ownerError(
        new Error(error.message),
        error.code === "40001" ? 409 : 400,
      );
    return NextResponse.json({ item: data });
  } catch (e) {
    return ownerError(e);
  }
}
