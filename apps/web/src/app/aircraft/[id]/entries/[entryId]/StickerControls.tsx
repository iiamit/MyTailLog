"use client";

import { useState } from "react";
import type { LogEntry } from "@/lib/database.types";
import { EntrySticker } from "@/components/EntrySticker";
import { buttonClass } from "@/ui/Button";
import { fieldClass } from "@/ui/Form";

export function StickerControls({ entry, tailNumber, logbookName, v2 = false }: { entry: LogEntry; tailNumber: string; logbookName: string; v2?: boolean }) {
  const [width, setWidth] = useState(4);
  const [paper, setPaper] = useState("letter");
  return <>
    <div className="no-print mb-5 flex flex-wrap items-center gap-3">
      <label className={v2 ? "text-label" : "text-sm"}>Sticker width (inches) <input type="number" min="2" max="7" step="0.25" className={v2 ? `${fieldClass} w-24` : "ml-2 w-20 rounded border border-line bg-panel p-2"} value={width} onChange={(e) => setWidth(Math.min(7, Math.max(2, Number(e.target.value) || 4)))} /></label>
      <label className={v2 ? "text-label" : "text-sm"}>Paper <select className={v2 ? `${fieldClass} w-36` : "ml-2 rounded border border-line bg-panel p-2"} value={paper} onChange={(e) => setPaper(e.target.value)}><option value="letter">US Letter</option><option value="A4">A4</option></select></label>
      <button type="button" onClick={() => window.print()} className={v2 ? buttonClass("primary") : "rounded bg-accent px-4 py-2 text-sm font-medium text-bg"}>Print or save PDF</button>
      <span className={v2 ? "text-small text-ink-3" : "text-xs text-dim"}>Print at 100% scale on full-sheet adhesive paper and trim to fit. Check on plain paper first.</span>
    </div>
    <EntrySticker entry={entry} tailNumber={tailNumber} logbookName={logbookName} widthIn={width} />
    <style>{v2
      ? `@media print { body * { visibility: hidden !important } .sticker, .sticker * { visibility: visible !important } .sticker { position: fixed; top: 0; left: 0; margin: 0 !important; break-inside: avoid; } @page { size: ${paper}; margin: 0.25in; } }`
      : `@media print { .no-print { display: none !important } body { background: white !important } main { max-width: none !important; padding: 0 !important } .sticker { margin: 0 !important; break-inside: avoid; } @page { size: ${paper}; margin: 0.25in; } }`}</style>
  </>;
}
