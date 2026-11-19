"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Plus, Upload, Warehouse } from "lucide-react";
import { AccountButton, Popover } from "@/ui/Rail";
import type { RailAircraft } from "@/ui/Rail";

/**
 * The rail outside an aircraft (03 §3.5): the MyTailLog plate, one Hangar tab, the aircraft list, Add and account.
 * shortcut: Search or ask is per aircraft today, so the hangar rail leaves it out until a fleet-wide search exists.
 */
export function HangarRail({ userName, aircraft, isAdmin, hangarOpen }: { userName: string; aircraft: RailAircraft[]; isAdmin?: boolean; hangarOpen?: boolean }) {
  const path = usePathname().replace(/^\/v2/, "");
  const [menu, setMenu] = useState<null | "add" | "account">(null);
  return (
    <aside className="rail flex h-dvh shrink-0 flex-col gap-1 bg-cover pt-[18px] pb-4 pl-[14px] text-on-cover max-lg:w-[184px] lg:w-[216px] max-md:hidden">
      <div className="pt-0.5 pr-[14px] pb-3.5 pl-1">
        <p className="text-[24px] leading-[1.1] font-extrabold tracking-[.02em]">MyTailLog</p>
        <p className="truncate text-[13px] text-on-cover-2">{userName}</p>
      </div>
      <nav aria-label="Hangar" className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        <Link
          href="/hangar"
          data-section="setup"
          aria-current={hangarOpen ? "page" : undefined}
          className={`state-layer flex min-h-[72px] flex-col gap-px rounded-l-tab bg-board py-[11px] pl-3 text-on-board ${hangarOpen ? "mr-0 pr-6" : "mr-3 pr-3"}`}
        >
          <span className="text-tab">Hangar</span>
          <span className="text-tab-sub">{aircraft.length === 1 ? "1 aircraft" : `${aircraft.length} aircraft`}</span>
        </Link>
        {aircraft.length > 0 && (
          <>
            <h2 className="mt-4 px-1 text-[13px] font-bold text-on-cover-2">Aircraft</h2>
            <ul className="pr-[14px]">
              {aircraft.map((a) => (
                <li key={a.id}>
                  <Link href={`/aircraft/${a.id}/status`} className="state-layer flex min-h-11 flex-col justify-center rounded-tab px-2 py-1.5">
                    <span className="text-[15px] font-bold">{a.tail}</span>
                    {a.model && <span className="truncate text-[13px] text-on-cover-2">{a.model}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>
      <nav aria-label="Tools" className="mt-auto grid gap-2 pr-[14px]">
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
              onClick={() => setMenu(menu === "add" ? null : "add")}
              className="state-layer flex h-[42px] items-center gap-2.5 rounded-tab bg-on-cover px-3 text-[15px] font-semibold text-cover"
            >
              <Plus aria-hidden size={18} /> Add
            </button>
          )}
        >
          <div role="menu" aria-label="Add" className="w-[320px] py-2">
            {[
              { href: "/aircraft/new", icon: Warehouse, label: "Add an aircraft", detail: "Type the tail number; the registry fills the rest" },
              { href: "/hangar#import", icon: Upload, label: "Import a backup", detail: "Restore an aircraft from a MyTailLog .zip" },
            ].map((i) => (
              <Link
                key={i.href}
                role="menuitem"
                href={i.href}
                onClick={() => setMenu(null)}
                className="state-layer grid min-h-14 grid-cols-[36px_1fr] items-center gap-3 px-4 py-2"
              >
                <span data-section="setup" className="flex size-9 items-center justify-center rounded-control bg-board text-on-board">
                  <i.icon aria-hidden size={18} />
                </span>
                <span>
                  <span className="block text-[16px] font-bold">{i.label}</span>
                  <span className="block text-[14px] text-ink-3">{i.detail}</span>
                </span>
              </Link>
            ))}
          </div>
        </Popover>
        <AccountButton
          open={menu === "account"}
          onToggle={() => setMenu("account")}
          onClose={() => setMenu(null)}
          name={userName}
          next={path || "/hangar"}
          isAdmin={isAdmin}
        />
      </nav>
    </aside>
  );
}

/** Phone-width browsers (03 §15): the plate and the account links in one bar above the board. */
export function HangarPhoneBar() {
  const path = usePathname().replace(/^\/v2/, "");
  const link = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? "page" : undefined} className="state-layer flex min-h-11 items-center rounded-tab px-3 text-[15px] font-semibold aria-[current=page]:bg-cover-2">
      {label}
    </Link>
  );
  return (
    <nav aria-label="Account" className="flex items-center gap-1 bg-cover px-4 py-2 text-on-cover md:hidden">
      <p className="mr-auto text-[20px] font-extrabold tracking-[.02em]">MyTailLog</p>
      {link("/hangar", "Hangar")}
      {link("/account/settings", "Settings")}
    </nav>
  );
}
