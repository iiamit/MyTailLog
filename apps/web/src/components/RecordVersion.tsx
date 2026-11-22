"use client";

import { useState } from "react";

/** Keep the version of uncontrolled fields, even if their parent refreshes while dirty.
 * Key by record ID when one editor location can display different records. */
export function RecordVersion({ base }: { base: string }) {
  const [snapshot] = useState(base);
  return <input type="hidden" name="base" value={snapshot} />;
}
