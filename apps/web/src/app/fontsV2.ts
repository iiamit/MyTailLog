import localFont from "next/font/local";

// Direction D's two voices (01 §5), for the v2 tree and the record room. Loaded only where imported, so v1 pages don't pay for them.
export const franklin = localFont({
  src: "./fonts/LibreFranklin.ttf",
  weight: "100 900",
  variable: "--font-libre-franklin",
  display: "swap",
});
export const literata = localFont({
  src: "./fonts/Literata.ttf",
  weight: "200 900",
  variable: "--font-literata",
  display: "swap",
});
