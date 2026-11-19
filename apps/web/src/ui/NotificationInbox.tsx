"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/ui/Button";

export type InboxItem = {
  id: string;
  aircraftId: string | null;
  title: string;
  body: string;
  deepLink: string | null;
  actions: { id: string; label: string }[] | null;
  createdAt: string;
  readAt: string | null;
};

const shiftYears = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;

/**
 * An app deep link (`mytaillog://…`, `https://mytaillog.com/app/…` or `/app/…`) → the web route (03 §10.3).
 * Unknown paths fall back to the aircraft's Status, or the hangar without an aircraft.
 */
export function appLinkToWeb(link: string | null | undefined): string {
  if (!link) return "/hangar";
  const raw = link.replace(/^mytaillog:\/\//, "/").replace(/^https?:\/\/[^/]+\/app\//, "/").replace(/^\/app\//, "/");
  const url = new URL(raw.startsWith("/") ? raw : `/${raw}`, "http://x");
  const q = url.searchParams;
  const m = /^\/aircraft\/([^/]+)(\/.*)?$/.exec(url.pathname);
  if (!m) return "/hangar";
  const a = `/aircraft/${m[1]}`;
  const rest = m[2] ?? "";
  let r: RegExpExecArray | null;
  if (rest === "/status" || rest === "/share") return a + rest;
  if ((r = /^\/status\/item\/([^/]+)$/.exec(rest))) return `${a}/status/item/${r[1]}`;
  if (rest === "/status/plan") return q.get("date") ? `${a}/status/plan?date=${encodeURIComponent(q.get("date")!)}` : `${a}/status/plan`;
  if ((r = /^\/status\/visit\/([^/]+)$/.exec(rest))) return `${a}/status/plan?visit=${r[1]}`;
  if (rest === "/books/map") {
    const at = q.get("at");
    return at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? `${a}/logbooks/map?from=${shiftYears(at, -2)}&to=${shiftYears(at, 2)}` : `${a}/logbooks/map`;
  }
  if (rest === "/books/review") return q.get("batch") ? `${a}/logbooks/review?batch=${encodeURIComponent(q.get("batch")!)}` : `${a}/logbooks/review`;
  if ((r = /^\/books\/entry\/([^/]+)$/.exec(rest))) return `${a}/logbooks/entries/${r[1]}`;
  if ((r = /^\/maint\/squawk\/([^/]+)$/.exec(rest))) return `${a}/maintenance/squawks?squawk=${r[1]}`;
  return `${a}/status`;
}

const when = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const fetchInbox = (): Promise<InboxItem[] | null> =>
  fetch("/api/me/notifications")
    .then((r) => (r.ok ? (r.json() as Promise<{ items: InboxItem[] }>) : null))
    .then((b) => b?.items ?? null)
    .catch(() => null);

/** Unread count for the account button's dot. Fetched once per page; null until known or on failure. */
export function useUnread() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { items?: InboxItem[] } | null) => live && b?.items && setN(b.items.filter((i) => !i.readAt).length))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return [n, setN] as const;
}

/** NotificationInbox (03 §5.4): reminders and reading updates for 90 days, read state kept on the server. */
export function NotificationInbox({ onRead }: { onRead?: (unread: number) => void }) {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState(false);

  const apply = useCallback(
    (list: InboxItem[] | null) => {
      if (!list) return setError(true);
      setItems(list);
      onRead?.(list.filter((i) => !i.readAt).length);
    },
    [onRead],
  );
  const load = useCallback(() => fetchInbox().then(apply), [apply]);
  useEffect(() => {
    fetchInbox().then(apply);
  }, [apply]);

  const open = async (i: InboxItem) => {
    if (!i.readAt) await post(`/api/me/notifications/${i.id}`, { read: true }).catch(() => {});
    router.push(appLinkToWeb(i.deepLink));
  };
  const act = async (i: InboxItem, actionId: string) => {
    const r = await post(`/api/me/notifications/${i.id}/action`, { actionId }).catch(() => null);
    const b = r?.ok ? ((await r.json().catch(() => ({}))) as { deepLink?: string }) : null;
    if (b?.deepLink) router.push(appLinkToWeb(b.deepLink));
    else load();
  };
  const readAll = async () => {
    await Promise.all((items ?? []).filter((i) => !i.readAt).map((i) => post(`/api/me/notifications/${i.id}`, { read: true }).catch(() => {})));
    load();
  };

  return (
    <div className="flex max-h-[70vh] w-[400px] max-w-[calc(100vw-32px)] flex-col">
      <h2 className="border-b border-rule px-4 py-3 text-section">Notifications</h2>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <p role="alert" className="px-4 py-4 text-body text-ink-2">Notifications could not be loaded.</p>
        ) : items == null ? (
          <p className="px-4 py-4 text-body text-ink-3">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-4 text-body text-ink-2">Nothing new. Reminders and reading updates appear here for 90 days.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {items.map((i) => (
              <li key={i.id} className="px-4 py-3">
                <button role="menuitem" type="button" onClick={() => open(i)} className="state-layer block w-full rounded-control text-left">
                  <span className="flex items-baseline gap-2">
                    {!i.readAt && <span aria-label="Unread" className="inline-block size-2 shrink-0 rounded-full bg-ink" />}
                    <span className="text-body font-bold">{i.title}</span>
                    <span className="ml-auto shrink-0 text-caption text-ink-3">{when(i.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-3 block text-small text-ink-2">{i.body}</span>
                </button>
                {i.actions && i.actions.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-2">
                    {i.actions.map((x) => (
                      <button key={x.id} type="button" className={buttonClass("secondary", "s")} onClick={() => act(i, x.id)}>
                        {x.label}
                      </button>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-rule px-2 py-2">
        <button type="button" className={buttonClass("quiet", "s")} onClick={readAll} disabled={!items?.some((i) => !i.readAt)}>
          Mark all as read
        </button>
        <Link href="/account/settings#reminders" className={buttonClass("quiet", "s")}>
          Notification settings
        </Link>
      </div>
    </div>
  );
}
