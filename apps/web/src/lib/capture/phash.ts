import { dHash } from "@/lib/v2/capture";

/** The page's 64-bit dHash (09 §3.9.3): the image scaled to 9 × 8 greyscale. Null when the browser can't decode it. */
export async function phashOf(blob: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, 9, 8);
    bitmap.close?.();
    const { data } = ctx.getImageData(0, 0, 9, 8);
    const gray = new Float32Array(72);
    for (let i = 0; i < 72; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    return dHash(gray);
  } catch {
    return null;
  }
}
