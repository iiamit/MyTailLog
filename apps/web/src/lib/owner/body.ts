/** Bound streamed bodies too: Content-Length alone is not a memory limit. */
export async function ownerBody(
  req: Request,
  limit: number,
): Promise<Uint8Array> {
  if (Number(req.headers.get("content-length") ?? 0) > limit)
    throw new RangeError(
      "Request too large. Upload a smaller file or fewer records.",
    );
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RangeError(
          "Request too large. Upload a smaller file or fewer records.",
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function ownerJson(
  req: Request,
  limit = 64 * 1024,
): Promise<Record<string, unknown>> {
  const value = JSON.parse(
    new TextDecoder().decode(await ownerBody(req, limit)),
  );
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Send an object containing the record details.");
  return value;
}
