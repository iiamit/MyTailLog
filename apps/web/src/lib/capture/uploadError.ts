// The uploads API's answer when storage can't sign an upload URL (05 §7.2). The backend's own words (a GCP IAM
// error with an internal troubleshooting link, say) go to the server log, never to the phone.
export const UPLOAD_PREPARE_FAILED = { error: "Couldn't prepare the upload. It will try again.", code: "upload_unavailable" } as const;

export function uploadPrepareFailed(path: string, detail: string) {
  console.error(`[uploads] couldn't sign an upload URL for ${path}: ${detail}`);
  return UPLOAD_PREPARE_FAILED;
}
