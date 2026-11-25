import { Readable } from "node:stream";
import { Zip, ZipPassThrough } from "fflate";
import {
  PACKET_MAX_BYTES,
  annualPacketText,
  type AnnualPacket,
  type PacketEvidence,
} from "./annualPacket";

/** One source file at a time, with stream backpressure; a missing selection fails the download. */
export function annualArchive(
  packet: AnnualPacket,
  pdf: Buffer,
  selected: PacketEvidence[],
  read: (e: PacketEvidence) => Promise<Uint8Array | null>,
): ReadableStream<Uint8Array> {
  async function* chunks() {
    const pending: Uint8Array[] = [];
    let failure: Error | null = null;
    let total = 0;
    const archive = new Zip((error, bytes) => {
      if (error) failure = error;
      total += bytes.length;
      if (total > PACKET_MAX_BYTES)
        failure = new Error("The packet exceeds the 100 MB download limit.");
      if (!failure && bytes.length) pending.push(bytes.slice());
    });
    const add = (name: string, data: Uint8Array) => {
      const file = new ZipPassThrough(name);
      archive.add(file);
      file.push(data, true);
      if (failure) throw failure;
    };
    const enc = new TextEncoder();
    const manifest = {
      ...packet,
      selectedEvidence: selected.map((e) => ({
        id: e.id,
        kind: e.kind,
        fileName: e.fileName,
      })),
    };
    add("annual-summary.pdf", pdf);
    add(
      "README.txt",
      enc.encode(
        annualPacketText(packet) +
          "\n\nIncluded files\n" +
          selected.map((e) => e.fileName).join("\n"),
      ),
    );
    add("manifest.json", enc.encode(JSON.stringify(manifest, null, 2)));
    while (pending.length) yield pending.shift()!;
    try {
      for (const source of selected) {
        const bytes = await read(source);
        if (!bytes)
          throw new Error(
            `Selected evidence could not be read: ${source.label}`,
          );
        add(source.fileName, bytes);
        while (pending.length) yield pending.shift()!;
      }
      archive.end();
      if (failure) throw failure;
      while (pending.length) yield pending.shift()!;
    } finally {
      archive.terminate();
    }
  }
  return Readable.toWeb(Readable.from(chunks())) as ReadableStream<Uint8Array>;
}
