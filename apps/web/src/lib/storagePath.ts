/** Storage credentials bypass RLS; every referenced key must belong to the authorized aircraft. */
export function aircraftStoragePath(path: string, aircraftIds: string | readonly string[]): boolean {
  const ids = typeof aircraftIds === "string" ? [aircraftIds] : aircraftIds;
  const parts = path.split("/");
  return ids.includes(parts[0]) && parts.length > 1 && parts.every((p) => p !== "" && p !== "." && p !== "..") && !/[\\\x00-\x1f%]/.test(path);
}
