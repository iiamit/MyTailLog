/** Queue first; a failed refresh must never invite a second submission. */
export async function runReviewWrite(queue: () => Promise<unknown>, refresh: () => Promise<unknown>) {
  let queued = false;
  try {
    await queue();
    queued = true;
    await refresh();
    return { queued, error: null };
  } catch {
    return {
      queued,
      error: queued
        ? "This change is queued, but the view could not be refreshed. Reload the view or sync from Account before trying this action again."
        : "Could not save this change on the device. Check available storage and changes waiting to upload, then try again.",
    };
  }
}

/** Retain completed steps so a partial save retries only unfinished work. */
export function resumableWrite(steps: (() => Promise<unknown>)[]) {
  let next = 0;
  return async () => {
    while (next < steps.length) {
      await steps[next]();
      next++;
    }
  };
}
