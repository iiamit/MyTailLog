// What the vault will accept, decided on the phone BEFORE a file is base64'd
// into the upload queue. Dependency-free so it can be unit-tested off-device —
// see apps/web/test/mobile-document-validate.test.ts.
//
// These limits mirror POST /api/aircraft/[id]/documents exactly. They are a
// courtesy, not a boundary: the route re-checks everything. The point is that a
// 40 MB scan should be refused while the owner is looking at it, not silently
// held on the phone and rejected days later when there's finally signal.

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

/** What an <input type="file"> should offer. */
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

const BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * The MIME type to send. Files dropped from iPadOS and files picked out of some
 * cloud providers arrive with an empty or generic type ("application/octet-
 * stream"), so the extension is the fallback — otherwise a perfectly good PDF is
 * refused for having no label on it.
 */
export function mimeFor(fileName: string, given?: string | null): string {
  const g = (given ?? "").toLowerCase();
  if ((ACCEPTED_MIME as readonly string[]).includes(g)) return g;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return BY_EXTENSION[ext] ?? g;
}

export type DocumentCheck = { ok: true; mime: string } | { ok: false; message: string };

/** Human-sized: "24.6 MB", "812 KB". */
export function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

export function validateDocument(file: { name: string; type?: string | null; size: number }): DocumentCheck {
  if (file.size <= 0) return { ok: false, message: "That file is empty." };
  const mime = mimeFor(file.name, file.type);
  if (!(ACCEPTED_MIME as readonly string[]).includes(mime)) {
    return { ok: false, message: `${file.name} isn't a PDF or a photo. The vault takes PDF, JPEG, PNG and WebP.` };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      message: `${file.name} is ${fileSizeLabel(file.size)} — too big to upload. The limit is 25 MB.`,
    };
  }
  return { ok: true, mime };
}
