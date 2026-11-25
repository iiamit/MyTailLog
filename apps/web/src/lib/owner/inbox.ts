import { createHash } from "node:crypto";
import sharp from "sharp";
import { dHash } from "@/lib/v2/capture";
import { getBlob, putBlob } from "@/lib/storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
export const ACCEPTED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const MAX_ORIGINAL = 25 * 1024 * 1024;
export const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export const stableId = (seed: string) => {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export async function verifyOriginal(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > MAX_ORIGINAL)
    throw new Error("Upload a nonempty file of at most 25 MB.");
  if (!ACCEPTED.includes(mime))
    throw new Error("Choose a PDF, JPEG, PNG or WebP file.");
  if (mime === "application/pdf") {
    if (!bytes.subarray(0, 8).toString().startsWith("%PDF-"))
      throw new Error("This file is not a PDF.");
  } else {
    const m = await sharp(bytes, { limitInputPixels: 80_000_000 }).metadata();
    if (!m.width || !m.height || m.format !== mime.slice(6))
      throw new Error("This image could not be read.");
  }
}
export async function putIdentical(
  path: string,
  bytes: Buffer,
  mime: string,
  aircraft: string,
) {
  const { error } = await putBlob(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) {
    const old = await getBlob(path, aircraft);
    if (!old || !old.data.equals(bytes))
      throw new Error(
        "The upload identifier already contains different bytes. Retry with its original file.",
      );
  }
}
export async function stagePage(
  supabase: SupabaseClient<Database>,
  aircraft: string,
  item: string,
  index: number,
  bytes: Buffer,
) {
  if (
    !Number.isInteger(index) ||
    index < 1 ||
    index > 500 ||
    bytes.length > 12 * 1024 * 1024
  )
    throw new Error("Upload a page numbered 1 to 500, at most 12 MB.");
  const metadata = await sharp(bytes, {
    limitInputPixels: 40_000_000,
  }).metadata();
  if (metadata.format !== "jpeg")
    throw new Error("Rendered pages must be JPEG.");
  const path = `${aircraft}/inbox/${item}/page-${index}.jpg`;
  await putIdentical(path, bytes, "image/jpeg", aircraft);
  const gray = await sharp(bytes)
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const page = {
    imagePhash: dHash(gray),
    index,
    pageId: stableId(`${item}:${index}`),
    storagePath: path,
    sha256: digest(bytes),
  };
  const { data, error } = await supabase.rpc("stage_inbox_page", {
    p_aircraft: aircraft,
    p_id: item,
    p_page: page,
  });
  if (error) throw new Error(error.message);
  return data;
}
