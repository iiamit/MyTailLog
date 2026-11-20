"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/**
 * The phone and tablet Menu: a disclosure button and its panel of every public page. Closes on navigation, Esc and a
 * click outside; Esc returns focus to the button.
 */
export function PublicMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pathname = usePathname();

  // A route change (including Back) closes the menu.
  const [at, setAt] = useState(pathname);
  if (at !== pathname) {
    setAt(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="state-layer flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-tab px-3 text-[15px] font-semibold max-sm:px-2.5"
      >
        {open ? <X aria-hidden size={18} /> : <Menu aria-hidden size={18} />}
        <span className="max-sm:sr-only">Menu</span>
      </button>
      <div
        id={panelId}
        hidden={!open}
        // A link inside closes the menu straight away, even when it points at the page already open.
        onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
        className="absolute top-full right-0 z-40 mt-1 max-h-[75dvh] w-[min(320px,calc(100vw-32px))] overflow-auto rounded-leaf bg-leaf p-2 text-ink shadow-[0_8px_18px_-8px_rgba(0,0,0,.7)]"
      >
        {children}
      </div>
    </div>
  );
}
