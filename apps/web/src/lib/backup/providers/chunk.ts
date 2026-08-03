// ===========================================================================
// Byte-stream chunking shared by every provider adapter.
//
// Lives on its own because both upload state machines depend on the same
// arithmetic and an off-by-one lands as a corrupt archive in someone's cloud
// account. One implementation, one set of tests — a second copy of this in the
// Google Drive adapter would be the exact drift worth avoiding.
// ===========================================================================

export type ArchiveSource = AsyncIterable<Buffer | Uint8Array | string>;

/**
 * Split an arbitrary byte stream into fixed-size chunks. The final chunk is the
 * remainder and may be empty (an empty stream yields exactly one empty chunk).
 *
 * Per-provider call-size caps are the caller's business — Dropbox's 150 MB and
 * Google's 256 KB-multiple rule have nothing in common but this loop.
 */
export async function* chunkStream(body: ArchiveSource, size: number): AsyncGenerator<Buffer> {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`chunk size must be a positive integer (got ${size})`);
  }
  let held: Buffer[] = [];
  let heldLen = 0;
  for await (const piece of body) {
    let b = typeof piece === "string" ? Buffer.from(piece) : Buffer.from(piece);
    while (heldLen + b.length >= size) {
      const take = size - heldLen;
      held.push(b.subarray(0, take));
      yield Buffer.concat(held);
      held = [];
      heldLen = 0;
      b = b.subarray(take);
    }
    if (b.length) {
      held.push(b);
      heldLen += b.length;
    }
  }
  yield Buffer.concat(held);
}

/**
 * Re-yield an async iterable with a one-item lookahead, flagging the final item.
 *
 * Google Drive needs this and Dropbox doesn't: a resumable session must declare
 * the total size on the last chunk and only the last chunk may break the 256 KB
 * alignment rule, so "is this the last one?" has to be known *before* the
 * request is sent — and we're streaming, so the total isn't known up front.
 */
export async function* withLast<T>(src: AsyncIterable<T>): AsyncGenerator<{ value: T; last: boolean }> {
  let prev!: T;
  let have = false;
  for await (const value of src) {
    if (have) yield { value: prev, last: false };
    prev = value;
    have = true;
  }
  if (have) yield { value: prev, last: true };
}
