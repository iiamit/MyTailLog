import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Board } from "@/ui/Board";
import { RouteMap } from "@/ui/RouteMap";
import { aircraftTail } from "@/lib/v2/landing";
import { loadBooks } from "@/lib/v2/booksLoad";
import { addYears, shelfBooks } from "@/lib/v2/books";
import { BooksHead } from "../BooksHead";
import { AddPages, type Volume } from "./AddPages";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Add pages · ${await aircraftTail(id)}` };
}

/** W-BOOKS-06 Add pages and the reading queue: files, the phone or this device's camera into one queue. */
export default async function AddPagesScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ book?: string; vol?: string; capture?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const books = await loadBooks(id);
  const { supabase, model, due, context } = books;
  const a = `/aircraft/${id}`;
  if (!context.canEdit) redirect(`${a}/logbooks/pages`);

  const lines = model?.lines ?? [];
  const pages = due?.loaded.input.page ?? [];
  // Every book can take pages, Other included (the map draws no line for it, 10 §1).
  const volumes: Volume[] = shelfBooks(lines, due?.loaded.input.logbook ?? []).flatMap((l) =>
    l.volumes.map((v, i) => {
      const own = pages.filter((p) => p.logbook_id === v.id);
      return {
        id: v.id,
        type: l.logbook,
        label: `${l.name}${l.volumes.length > 1 ? `, vol. ${i + 1}` : ""}`,
        pages: own.length,
        lastSeq: own.reduce((m, p) => Math.max(m, p.page_sequence ?? 0), 0),
      };
    }),
  );
  const airframe = lines.find((l) => l.logbook === "airframe");
  const byBook = lines.find((l) => l.logbook === sp.book);
  const target =
    volumes.find((v) => v.id === sp.vol) ??
    (byBook ? volumes.find((v) => v.id === byBook.volumes[byBook.volumes.length - 1].id) : undefined) ??
    (airframe ? volumes.find((v) => v.id === airframe.volumes[airframe.volumes.length - 1].id) : undefined) ??
    volumes[0];

  // Where the new pages land: the span of this book's recently queued pages that the reader has dated.
  const { data: recent } = target
    ? await supabase.from("page").select("landing_date").eq("aircraft_id", id).eq("logbook_id", target.id)
      .not("batch_id", "is", null).not("landing_date", "is", null).order("created_at", { ascending: false }).limit(200)
    : { data: [] };
  const dates = (recent ?? []).map((r) => r.landing_date!).sort();
  const span = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  const book = lines.find((l) => l.volumes.some((v) => v.id === target?.id));

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  return (
    <Board section="books">
      <BooksHead
        id={id}
        books={books}
        current="pages"
        spine={{ context: span ? "new pages" : "whole life", window: span, windowDescription: span ? "the span the new pages land in" : undefined }}
      />
      <AddPages
        aircraftId={id}
        volumes={volumes}
        initialVolume={target?.id ?? ""}
        startCamera={sp.capture === "1"}
        origin={origin}
        waitingForYou={due?.snap.counts.pagesToReview ?? 0}
        span={span ? { from: span.from.slice(0, 4), to: span.to.slice(0, 4) } : null}
        map={
          model && book && model.stops.some((s) => s.lineId === book.lineId) ? (
            <RouteMap
              model={model}
              tail={context.reg}
              base={`${a}/logbooks/map`}
              aircraftPath={a}
              params={{ book: book.logbook as never, ...(span ? { from: addYears(span.from, -2), to: addYears(span.to, 2) } : {}) }}
              selected={null}
              stopInfo={{}}
              ringNames={{}}
            />
          ) : null
        }
      />
    </Board>
  );
}
