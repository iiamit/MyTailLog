"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { buttonClass } from "@/ui/Button";

// Settings › Accessibility "Single-key shortcuts" (WCAG 2.1.4).
// shortcut: kept per browser in localStorage, not profile.preferences; move it there with the design choice.
const KEYS_STORAGE = "mtl_single_keys";
const OPEN_EVENT = "mtl:shortcuts";

export function singleKeysOn(): boolean {
  try {
    return localStorage.getItem(KEYS_STORAGE) !== "off";
  } catch {
    return true;
  }
}

const subscribeKeys = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

export function setSingleKeys(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEYS_STORAGE);
    else localStorage.setItem(KEYS_STORAGE, "off");
  } catch {
    /* private mode: the toggle just doesn't persist */
  }
}

/** Single-key shortcuts are ignored while typing (03 §8). */
export const inField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export const openShortcutSheet = () => window.dispatchEvent(new Event(OPEN_EVENT));

/** The go-to keys after `g` (11 §4, 03 §8). `t` works everywhere; the rest need an aircraft. */
export const GO_KEYS: Record<string, { label: string; path: string | null }> = {
  s: { label: "Status", path: "status" },
  l: { label: "Logbooks", path: "logbooks" },
  m: { label: "Maintenance", path: "maintenance" },
  a: { label: "Aircraft", path: "hours" },
  d: { label: "Documents", path: "documents" },
  h: { label: "Share", path: "share" },
  t: { label: "the hangar", path: null },
};

/** Where `g` + key leads from this path, or null. Exported for the test. */
export function goTarget(pathname: string, key: string): string | null {
  const go = GO_KEYS[key.toLowerCase()];
  if (!go) return null;
  if (!go.path) return "/hangar";
  const m = /^(?:\/v2)?\/aircraft\/([^/]+)/.exec(pathname);
  return m && m[1] !== "new" ? `/aircraft/${m[1]}/${go.path}` : null;
}

const SHEET: { group: string; rows: [string[], string][] }[] = [
  {
    group: "Everywhere",
    rows: [
      [["?"], "Show these shortcuts"],
      [["/"], "Search or ask"],
      [["Ctrl", "K"], "Search or ask, also while typing"],
      [["g", "t"], "Go to the hangar"],
      [["Esc"], "Close the open menu, panel or dialog"],
    ],
  },
  {
    group: "In an aircraft",
    rows: [
      [["n"], "Add: log a flight, pages, a squawk, a document"],
      [["g", "s"], "Go to Status"],
      [["g", "l"], "Go to Logbooks"],
      [["g", "m"], "Go to Maintenance"],
      [["g", "a"], "Go to Aircraft"],
      [["g", "d"], "Go to Documents"],
      [["g", "h"], "Go to Share"],
      [["j", "k"], "Next or previous row in a list"],
      [["m"], "Mark done for the selected due item"],
    ],
  },
  {
    group: "Review desk",
    rows: [
      [["Enter"], "Accept the field and move on"],
      [["j", "k"], "Next or previous field"],
      [["a"], "Accept the field as read"],
      [["e"], "Edit the field"],
      [["x"], "Not on this page"],
      [["Ctrl", "Enter"], "Confirm the entry"],
      [["Shift", "Enter"], "Confirm the page and open the next"],
      [["[", "]"], "Previous or next page"],
    ],
  },
  {
    group: "Scans and the map",
    rows: [
      [["+", "−", "0"], "Zoom in, out, fit"],
      [["[", "]"], "Previous or next stop on this line"],
      [["l"], "Map: list view"],
    ],
  },
];

/**
 * App-wide keys (03 §8, 11 §4) and the ShortcutSheet they open with `?`. Mounted once in the v2 layout; the rail
 * keeps its own `n` because it owns the Add menu.
 */
export function Shortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let gAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = () => {
      const m = /^(?:\/v2)?\/aircraft\/([^/]+)/.exec(pathname);
      if (m && m[1] !== "new") router.push(`/aircraft/${m[1]}/ask`);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ask();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || inField(e.target) || !singleKeysOn()) return;
      if (sheet.current?.open) return;
      if (gAt && Date.now() - gAt < 1500) {
        gAt = 0;
        setPending(false);
        const to = goTarget(pathname, e.key);
        if (to) {
          e.preventDefault();
          router.push(to);
        }
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        sheet.current?.showModal();
      } else if (e.key === "/") {
        e.preventDefault();
        ask();
      } else if (e.key === "g") {
        gAt = Date.now();
        setPending(true);
        clearTimeout(timer);
        timer = setTimeout(() => setPending(false), 1500);
      }
    };
    const open = () => sheet.current?.showModal();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, open);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, open);
    };
  }, [pathname, router]);

  return (
    <>
      {pending && (
        <p role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-control bg-ink px-3 py-2 text-[15px] font-semibold text-leaf shadow-leaf">
          g…
        </p>
      )}
      <dialog
        ref={sheet}
        aria-labelledby="shortcut-sheet-title"
        className="m-auto max-h-[86vh] w-[min(720px,calc(100vw-32px))] overflow-auto rounded-leaf bg-leaf p-0 text-ink shadow-leaf backdrop:bg-mat/60"
      >
        <div className="sticky top-0 flex items-baseline justify-between gap-3 border-b border-rule bg-leaf px-6 pt-5 pb-3">
          <h2 id="shortcut-sheet-title" tabIndex={-1} className="text-heading">Keyboard shortcuts</h2>
          <button type="button" autoFocus className={buttonClass("quiet", "s")} onClick={() => sheet.current?.close()}>
            Close
          </button>
        </div>
        <div className="grid gap-x-8 px-6 pb-6 sm:grid-cols-2">
          {SHEET.map((g) => (
            <section key={g.group} className="pt-4">
              <h3 className="mb-1 text-section">{g.group}</h3>
              <dl className="divide-y divide-rule">
                {g.rows.map(([keys, action]) => (
                  <div key={action + keys.join()} className="flex items-center justify-between gap-4 py-1.5">
                    <dt className="text-body text-ink-2">{action}</dt>
                    <dd className="flex shrink-0 gap-1" aria-label={keys.join(" then ")}>
                      {keys.map((k) => (
                        <kbd key={k} className="min-w-6 rounded-leaf border border-rule-2 px-1.5 py-0.5 text-center font-[inherit] text-[13px] font-semibold">
                          {k}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="border-t border-rule px-6 py-3 text-small text-ink-3">
          Single-key shortcuts are ignored while you type, and can be turned off in Settings › Accessibility.
        </p>
      </dialog>
    </>
  );
}

/** "Show shortcuts" / the account menu item: any control can open the sheet. */
export function ShowShortcutsButton({ className, children = "Show shortcuts" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={className ?? buttonClass("secondary", "s")} onClick={openShortcutSheet}>
      {children}
    </button>
  );
}

/** Settings › Accessibility toggle for single-key shortcuts. Saves as it changes. */
export function SingleKeysToggle() {
  const [, bump] = useState(0);
  // Read from storage on the client, "on" on the server (the default).
  const on = useSyncExternalStore(subscribeKeys, singleKeysOn, () => true);
  const setOn = (v: boolean) => {
    setSingleKeys(v);
    bump((n) => n + 1);
  };
  return (
    <label className="flex items-start gap-3 text-body">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => setOn(e.target.checked)}
        className="mt-1 size-[18px] shrink-0"
      />
      <span>
        <span className="block font-semibold">Single-key shortcuts</span>
        <span className="block text-small text-ink-3">Keys like / and n without Ctrl. Turn off if they get in the way of speech input or switch control.</span>
      </span>
    </label>
  );
}
