"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";

export function NavigationMenu({ label, children }: { label: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <details
      key={pathname}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a")) event.currentTarget.open = false;
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-line2 px-3 text-sm text-ink hover:bg-panel2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        {label}<span aria-hidden="true" className="rotate-90"><ChevronRightIcon /></span>
      </summary>
      <div className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-6rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line2 bg-panel p-3 shadow-lg">
        {children}
      </div>
    </details>
  );
}
