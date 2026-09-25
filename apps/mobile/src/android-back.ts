/** Dismiss the visible sheet with the highest stacking order. */
export function dismissTopSheet<T extends { style: { zIndex: string }; click: () => void }>(sheets: readonly T[]): boolean {
  const top = sheets.reduce<T | null>((best, sheet) =>
    !best || Number(sheet.style.zIndex) >= Number(best.style.zIndex) ? sheet : best, null);
  if (!top) return false;
  top.click();
  return true;
}
