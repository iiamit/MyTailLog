import localFont from "next/font/local";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/uiV2";

// Direction D's two voices (01 §5). Loaded only under /v2 so v1 pages don't pay for them.
const franklin = localFont({
  src: "../fonts/LibreFranklin.ttf",
  weight: "100 900",
  variable: "--font-libre-franklin",
  display: "swap",
});
const literata = localFont({
  src: "../fonts/Literata.ttf",
  weight: "200 900",
  variable: "--font-literata",
  display: "swap",
});

/** Scope for the new design: tokens.css and v2.css apply inside [data-ui="v2"] only. */
export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div
      data-ui="v2"
      data-theme={theme === "system" ? undefined : theme}
      className={`v2-root ${franklin.variable} ${literata.variable}`}
    >
      <a
        href="#board-title"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-leaf focus:px-3 focus:py-2"
      >
        Skip to the board
      </a>
      {children}
    </div>
  );
}
