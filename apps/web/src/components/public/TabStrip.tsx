"use client";

import { useEffect, useRef } from "react";

// The phone tab strip scrolls sideways; bring the open tab into view so visitors can see where they are.
export function TabStrip({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const strip = ref.current;
    const open = strip?.querySelector<HTMLElement>("[aria-current]");
    if (strip && open) strip.scrollLeft = open.offsetLeft - strip.offsetLeft - 16;
  }, []);
  return (
    <nav ref={ref} aria-label="Site sections" className="flex gap-1 overflow-x-auto px-4 pt-2">
      {children}
    </nav>
  );
}
