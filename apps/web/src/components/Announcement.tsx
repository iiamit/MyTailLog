"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Notice = { id: string; title: string; body: string; link_path: string | null };

export function Announcement({ userId }: { userId: string | null }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("announcement").select("id,title,body,link_path").order("published_at", { ascending: false }),
      supabase.from("announcement_dismissal").select("announcement_id").eq("user_id", userId),
    ]).then(([announcements, dismissals]) => {
      if (!active || announcements.error || dismissals.error) return;
      const seen = new Set((dismissals.data ?? []).map((row) => row.announcement_id));
      setNotice((announcements.data ?? []).find((row) => !seen.has(row.id)) ?? null);
    });
    return () => { active = false; };
  }, [userId]);

  async function dismiss() {
    if (!notice || !userId) return;
    const { error } = await createClient().from("announcement_dismissal").insert({ announcement_id: notice.id, user_id: userId });
    if (error && error.code !== "23505") { setError(true); return; }
    setNotice(null);
  }

  if (!notice) return null;
  return (
    <aside role="status" aria-label="MyTailLog update" className="mx-auto mt-4 flex max-w-6xl items-start gap-4 rounded-xl border border-accent/40 bg-panel px-5 py-4 text-sm shadow-lg">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{notice.title}</p>
        <p className="mt-1 whitespace-pre-line text-dim">{notice.body}</p>
        {notice.link_path && <a href={notice.link_path} className="mt-2 inline-block font-medium text-accent underline">Learn more</a>}
        {error && <p role="alert" className="mt-2 text-annun-red">Couldn&apos;t dismiss this update. Please try again.</p>}
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss update" className="rounded px-2 py-1 text-dim hover:text-ink">✕</button>
    </aside>
  );
}
