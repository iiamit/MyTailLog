import { useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { supabase, API_BASE } from "./supabase";
import { color } from "./tokens";

type Notice = { id: string; title: string; body: string; link_path: string | null };

export function Announcement({ userId }: { userId: string }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function refresh() {
      const [announcements, dismissals] = await Promise.all([
        supabase.from("announcement").select("id,title,body,link_path").order("published_at", { ascending: false }),
        supabase.from("announcement_dismissal").select("announcement_id").eq("user_id", userId),
      ]);
      if (!active || announcements.error || dismissals.error) return;
      const seen = new Set((dismissals.data ?? []).map((row) => row.announcement_id));
      setNotice((announcements.data ?? []).find((row) => !seen.has(row.id)) ?? null);
    }
    void refresh();
    window.addEventListener("online", refresh);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, [userId]);

  async function dismiss() {
    if (!notice) return;
    const { error } = await supabase.from("announcement_dismissal").insert({ announcement_id: notice.id, user_id: userId });
    if (error && error.code !== "23505") { setError(true); return; }
    setNotice(null);
  }

  if (!notice) return null;
  return (
    <div role="status" aria-label="MyTailLog update" style={{ position: "fixed", bottom: "calc(84px + env(safe-area-inset-bottom))", left: 16, right: 16, maxWidth: 560, margin: "0 auto", zIndex: 60, padding: 18, borderRadius: 16, border: `1px solid ${color.accent}`, background: color.surfaceRaised, boxShadow: "0 10px 32px #0008" }}>
      <div style={{ display: "flex", alignItems: "start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ color: color.ink }}>{notice.title}</strong>
          <p style={{ color: color.dim, whiteSpace: "pre-line", margin: "6px 0 0", fontSize: 14, lineHeight: 1.45 }}>{notice.body}</p>
          {notice.link_path && <button onClick={() => void Browser.open({ url: `${API_BASE}${notice.link_path}` })} style={{ border: 0, background: "transparent", color: color.accent, padding: "8px 0 0", fontSize: 14 }}>Learn more</button>}
          {error && <p role="alert" style={{ color: "#ff6b6b", fontSize: 13 }}>Couldn&apos;t dismiss this update. Please try again.</p>}
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss update" style={{ border: 0, background: "transparent", color: color.dim, fontSize: 20, padding: "0 2px" }}>×</button>
      </div>
    </div>
  );
}
