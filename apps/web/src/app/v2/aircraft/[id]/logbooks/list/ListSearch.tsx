"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** "Search these entries" (W-BOOKS-12): updates `q` after 300 ms (replace). */
export function ListSearch({ q }: { q: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [v, setV] = useState(q);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (v.trim()) next.set("q", v.trim());
      else next.delete("q");
      next.delete("stop");
      router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="flex min-w-[260px] flex-1 flex-col text-small font-semibold">
      <span className="sr-only">Search these entries</span>
      <input
        type="search"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Search these entries"
        className="h-[42px] rounded-control border border-control-border bg-leaf px-3 text-body font-normal"
      />
    </label>
  );
}
