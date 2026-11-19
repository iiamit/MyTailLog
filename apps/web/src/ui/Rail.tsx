"use client";

import Link from "next/link";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  CircleUserRound,
  Droplet,
  FilePlus2,
  Flag,
  Pencil,
  Plane,
  PlaneLanding,
  Plus,
  Search,
  Upload,
  Warehouse,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sectionFor, type Section } from "@/lib/uiV2";
import { inField, openShortcutSheet, singleKeysOn } from "@/ui/Shortcuts";
import type { RailTab } from "@/lib/v2/rail";

export type RailAircraft = { id: string; tail: string; model: string };

type Props = {
  aircraftId: string;
  tail: string;
  plateLine: string;
  tabs: RailTab[];
  aircraft: RailAircraft[];
  canEdit: boolean;
  userShortName: string;
  isAdmin?: boolean;
};

const ADD_ITEMS: { key: string; label: string; detail: string; section: Section; icon: typeof Plane; path: string }[] = [
  { key: "F", label: "Log a flight", detail: "Photograph the tach, or type it", section: "aircraft", icon: PlaneLanding, path: "meters" },
  { key: "O", label: "Add oil", detail: "Quarts added at the aircraft", section: "aircraft", icon: Droplet, path: "meters#oil" },
  { key: "S", label: "Report a squawk", detail: "A photo first, then a few words", section: "maint", icon: Flag, path: "squawks" },
  { key: "P", label: "Add logbook pages", detail: "Drop scans, or scan with your phone", section: "books", icon: Upload, path: "capture" },
  { key: "D", label: "Add a document", detail: "Insurance, registration, a Form 337", section: "docs", icon: FilePlus2, path: "documents" },
  { key: "W", label: "Write a logbook entry", detail: "Sign it with a code sent by email", section: "books", icon: Pencil, path: "entries/new" },
];

/** The binder cover (02 §3.1–3.7): plate and switcher, six section tabs, Search / Add / Account. */
export function Rail({ aircraftId, tail, plateLine, tabs, aircraft, canEdit, userShortName, isAdmin }: Props) {
  const segments = useSelectedLayoutSegments();
  const open = sectionFor(segments[0]);
  const router = useRouter();
  const [menu, setMenu] = useState<null | "switch" | "add" | "account">(null);
  const a = `/aircraft/${aircraftId}`;

  // `N` add and the letters inside the add menu (03 §8); `/`, `?` and `g` live in Shortcuts. Never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || inField(e.target) || !singleKeysOn()) return;
      if (menu === "add") {
        const item = ADD_ITEMS.find((i) => i.key === e.key.toUpperCase());
        if (item) {
          e.preventDefault();
          setMenu(null);
          router.push(`${a}/${item.path}`);
        }
        return;
      }
      if ((e.key === "n" || e.key === "N") && canEdit) {
        e.preventDefault();
        setMenu("add");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, canEdit, router, a]);

  const total = tabs.reduce((s, t) => s + t.weight, 0) || 1;

  return (
    <aside className="rail flex h-dvh shrink-0 flex-col gap-1 bg-cover pt-[18px] pb-4 pl-[14px] text-on-cover max-lg:w-[184px] lg:w-[216px] max-md:hidden">
      <Popover
        open={menu === "switch"}
        onClose={() => setMenu(null)}
        trigger={(ref) => (
          <button
            ref={ref}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu === "switch"}
            aria-label={`${tail}, ${plateLine}. Switch aircraft`}
            onClick={() => setMenu(menu === "switch" ? null : "switch")}
            className={`state-layer block w-full rounded-tab pt-0.5 pr-[14px] pb-3.5 pl-1 text-left ${menu === "switch" ? "bg-cover-2" : ""}`}
          >
            <span className="flex items-center justify-between text-[24px] leading-[1.1] font-extrabold tracking-[.02em]">
              {tail}
              <ChevronsUpDown aria-hidden size={16} className={menu === "switch" ? "" : "opacity-60"} />
            </span>
            <span className="block truncate text-[13px] text-on-cover-2">{plateLine}</span>
          </button>
        )}
      >
        <div role="menu" aria-label="Aircraft" className="w-[280px] py-2">
          {aircraft.map((x) => (
            <Link
              key={x.id}
              role="menuitem"
              aria-current={x.id === aircraftId ? "true" : undefined}
              href={`/aircraft/${x.id}/${segments[0] && sectionFor(segments[0]) ? segments[0] : "status"}`}
              onClick={() => setMenu(null)}
              className={`state-layer flex min-h-14 items-center justify-between gap-3 px-[14px] py-2 ${x.id === aircraftId ? "bg-leaf-2" : ""}`}
            >
              <span className="min-w-0">
                <span className="block text-[16px] font-bold text-ink">{x.tail}</span>
                <span className="block truncate text-[14px] text-ink-3">{x.model}</span>
              </span>
              {x.id === aircraftId && <Check aria-hidden size={16} />}
            </Link>
          ))}
          <hr className="my-1 border-rule" />
          <Link role="menuitem" href="/hangar" className="state-layer flex min-h-11 items-center gap-2.5 px-[14px] text-[15px] font-semibold">
            <Warehouse aria-hidden size={18} /> Hangar
          </Link>
          <Link role="menuitem" href="/aircraft/new" className="state-layer flex min-h-11 items-center gap-2.5 px-[14px] text-[15px] font-semibold">
            <Plus aria-hidden size={18} /> Add an aircraft
          </Link>
        </div>
      </Popover>

      <nav aria-label="Aircraft sections" className="flex max-h-[620px] min-h-0 flex-1 flex-col gap-1">
        {tabs.map((t) => {
          const isOpen = open === t.section;
          const name = [t.label, ...t.lines, t.flag].filter(Boolean).join(", ");
          return (
            <Link
              key={t.section}
              href={t.href}
              data-section={t.section}
              aria-current={isOpen ? "page" : undefined}
              aria-label={name}
              // Content height first, then a √n share of the free rail height (02 §3.4 height rule).
              style={{ flex: `${(t.weight / total) * 6} 0 auto` }}
              className={`state-layer relative flex max-h-[180px] min-h-[50px] flex-col gap-px rounded-l-tab bg-board py-[11px] pl-3 text-on-board ${
                isOpen ? "mr-0 pr-6" : "mr-3 pr-3"
              }`}
            >
              <span className="text-tab">{t.label}</span>
              {t.lines.map((l) => (
                <span key={l} className="text-tab-sub truncate max-lg:max-w-[130px]">
                  {l}
                </span>
              ))}
              {t.flag && (
                <span className={`absolute top-2.5 rounded-leaf bg-alarm px-1.5 py-px text-[12px] font-bold text-on-alarm ${isOpen ? "right-3" : "right-[22px]"}`}>
                  {t.flag}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Tools" className="mt-auto grid gap-2 pr-[14px]">
        <Link
          href={`${a}/ask`}
          aria-keyshortcuts="/"
          className="state-layer flex h-[42px] items-center gap-2.5 rounded-tab bg-cover-2 px-3 text-[15px] font-semibold"
        >
          <Search aria-hidden size={18} /> Search or ask
          <KeyHint>/</KeyHint>
        </Link>
        {canEdit && (
          <Popover
            open={menu === "add"}
            onClose={() => setMenu(null)}
            placement="up"
            trigger={(ref) => (
              <button
                ref={ref}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menu === "add"}
                aria-keyshortcuts="N"
                onClick={() => setMenu(menu === "add" ? null : "add")}
                className="state-layer flex h-[42px] items-center gap-2.5 rounded-tab bg-on-cover px-3 text-[15px] font-semibold text-cover"
              >
                <Plus aria-hidden size={18} /> Add
                <KeyHint dark>N</KeyHint>
              </button>
            )}
          >
            <div role="menu" aria-label={`Add to ${tail}`} className="w-[360px] py-2">
              <p className="px-4 py-2 text-[15px] font-bold">Add to {tail}</p>
              {ADD_ITEMS.map((item) => (
                <Link
                  key={item.key}
                  role="menuitem"
                  href={`${a}/${item.path}`}
                  onClick={() => setMenu(null)}
                  className="state-layer grid min-h-14 grid-cols-[36px_1fr_auto] items-center gap-3 px-4 py-2"
                >
                  <span data-section={item.section} className="flex size-9 items-center justify-center rounded-control bg-board text-on-board">
                    <item.icon aria-hidden size={18} />
                  </span>
                  <span>
                    <span className="block text-[16px] font-bold">{item.label}</span>
                    <span className="block text-[14px] text-ink-3">{item.detail}</span>
                  </span>
                  <KeyHint light>{item.key}</KeyHint>
                </Link>
              ))}
              <p className="px-4 py-2 text-[13px] text-ink-3">Each colour is the tab where it will be filed.</p>
            </div>
          </Popover>
        )}
        <Popover
          open={menu === "account"}
          onClose={() => setMenu(null)}
          placement="up"
          trigger={(ref) => (
            <button
              ref={ref}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menu === "account"}
              onClick={() => setMenu(menu === "account" ? null : "account")}
              className="state-layer flex h-[42px] items-center gap-2.5 rounded-tab px-3 text-[15px] font-semibold"
            >
              <CircleUserRound aria-hidden size={18} /> <span className="truncate">{userShortName}</span>
            </button>
          )}
        >
          <AccountMenu next={`${a}/status`} aircraftId={aircraftId} isAdmin={isAdmin} />
        </Popover>
      </nav>
    </aside>
  );
}

/**
 * Phone-width browsers (below 768, 03 §15): the tail on the cover and the six tabs as a scrolling strip.
 * shortcut: the full phone-browser layout (PhoneHeader with search and account, bottom tabs) lands in phase 6.
 */
export function PhoneTabs({ tail, tabs }: { tail: string; tabs: RailTab[] }) {
  const open = sectionFor(useSelectedLayoutSegments()[0]);
  return (
    <nav aria-label="Aircraft sections" className="bg-cover px-4 pt-3 text-on-cover md:hidden">
      <p className="pb-2 text-[20px] font-extrabold tracking-[.02em]">{tail}</p>
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4">
        {tabs.map((t) => (
          <Link
            key={t.section}
            href={t.href}
            data-section={t.section}
            aria-current={open === t.section ? "page" : undefined}
            className={`state-layer min-h-11 shrink-0 rounded-t-tab bg-board px-3 pt-2.5 text-[15px] font-bold text-on-board ${
              open === t.section ? "" : "opacity-[.92]"
            }`}
          >
            {t.label}
            {t.flag && <span className="ml-1.5 rounded-leaf bg-alarm px-1 text-[12px] text-on-alarm">{t.flag.split(" ")[0]}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** The account menu (03 §5.3). The notification inbox joins it when the inbox API lands. */
export function AccountMenu({ next, aircraftId, isAdmin }: { next: string; aircraftId?: string; isAdmin?: boolean }) {
  const router = useRouter();
  const item = "state-layer flex min-h-11 w-full items-center px-4 text-left text-[15px] font-semibold";
  return (
    <div role="menu" aria-label="Account" className="max-h-[80vh] w-[280px] overflow-auto py-2">
      <Link role="menuitem" href="/account/settings" className={item}>
        Settings
      </Link>
      <Link role="menuitem" href={aircraftId ? `/account/data?aircraft=${aircraftId}` : "/account/data"} className={item}>
        Import and export
      </Link>
      <Link role="menuitem" href="/hangar" className={item}>
        Hangar
      </Link>
      <button role="menuitem" type="button" className={item} onClick={openShortcutSheet}>
        Keyboard shortcuts <KeyHint light>?</KeyHint>
      </button>
      <hr className="my-1 border-rule" />
      <Link role="menuitem" href="/help" className={item}>
        Help
      </Link>
      <Link role="menuitem" href="/whats-new" className={item}>
        What&apos;s new
      </Link>
      <Link role="menuitem" href="/developers" className={item}>
        Developer API
      </Link>
      {isAdmin && (
        <Link role="menuitem" href="/admin" className={item}>
          Admin
        </Link>
      )}
      <p className="px-4 pt-3 pb-1 text-[13px] font-bold text-ink-3">Appearance</p>
      {(["system", "light", "dark"] as const).map((t) => (
        <a key={t} role="menuitem" href={`/api/ui?theme=${t}&next=${encodeURIComponent(next)}`} className={item}>
          {t === "system" ? "Match system" : t === "light" ? "Light" : "Dark"}
        </a>
      ))}
      <hr className="my-1 border-rule" />
      <a role="menuitem" href={`/api/ui?design=v1&next=${encodeURIComponent(next)}`} className={item}>
        Switch back to the current design
      </a>
      <button
        role="menuitem"
        type="button"
        className={item}
        onClick={async () => {
          await createClient().auth.signOut();
          router.push("/login");
          router.refresh();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

export function KeyHint({ children, dark, light }: { children: React.ReactNode; dark?: boolean; light?: boolean }) {
  return (
    <span
      aria-hidden
      className={`key-hint ml-auto rounded-leaf border px-[5px] py-[3px] text-[12px] leading-none font-medium ${
        dark ? "border-rule-2 text-ink-3" : light ? "border-rule-2 text-ink-3" : "border-[#4a4e57] text-on-cover-2"
      }`}
    >
      {children}
    </span>
  );
}

/** Leaf-coloured menu anchored to its trigger. Escape and outside clicks close it and return focus. */
export function Popover({
  open,
  onClose,
  trigger,
  children,
  placement = "down",
}: {
  open: boolean;
  onClose: () => void;
  trigger: (ref: React.RefObject<HTMLButtonElement | null>) => React.ReactNode;
  children: React.ReactNode;
  placement?: "down" | "up";
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        ref.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...(panel.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        e.preventDefault();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose]);
  return (
    <div className="relative">
      {trigger(ref)}
      {open && (
        <div
          ref={panel}
          className={`absolute z-50 rounded-control bg-leaf text-ink shadow-[0_8px_24px_-8px_rgba(0,0,0,.5)] ${
            placement === "up" ? "bottom-0 left-[calc(100%+8px)]" : "top-[calc(100%+4px)] left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
