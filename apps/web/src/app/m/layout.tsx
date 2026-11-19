import localFont from "next/font/local";

// Direction D's two voices (01 §5), as under /v2: the mechanic link page is account-free but drawn in the new design.
const franklin = localFont({ src: "../fonts/LibreFranklin.ttf", weight: "100 900", variable: "--font-libre-franklin", display: "swap" });
const literata = localFont({ src: "../fonts/Literata.ttf", weight: "200 900", variable: "--font-literata", display: "swap" });

/** Scope for tokens.css and v2.css; the visitor's system theme decides light or dark. */
export default function MechanicLinkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-ui="v2" className={`v2-root ${franklin.variable} ${literata.variable}`} style={{ overflowY: "auto" }}>
      {children}
    </div>
  );
}
