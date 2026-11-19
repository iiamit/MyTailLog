"use client";

import { buttonClass } from "@/ui/Button";

/** Prints only the carry-aboard list (the page's print rules hide everything else). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonClass("secondary", "s")} print:hidden`}>
      Print the carry-aboard list
    </button>
  );
}
