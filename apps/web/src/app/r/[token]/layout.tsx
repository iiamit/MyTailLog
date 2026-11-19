import { franklin, literata } from "@/app/fontsV2";

/**
 * The record room (W-SHARE-02) is Direction D for everyone: the recipient has no account and no design cookie. A light
 * binder whatever the viewer's theme; it covers the v1 chrome the root layout draws, and scrolls itself.
 */
export default function RoomLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-ui="v2" data-theme="light" className={`v2-root ${franklin.variable} ${literata.variable}`} style={{ overflowY: "auto" }}>
      {children}
    </div>
  );
}
