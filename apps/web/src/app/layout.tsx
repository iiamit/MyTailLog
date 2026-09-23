import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Glass-cockpit type system: display / UI / instrument-mono.
// Vendored fonts keep builds independent of Google Fonts responses/availability.
const display = localFont({
  src: "./fonts/SpaceGrotesk.ttf",
  weight: "300 700",
  style: "normal",
  variable: "--font-display",
  display: "swap",
});
const ui = localFont({
  src: "./fonts/InstrumentSans.ttf",
  weight: "400 700",
  style: "normal",
  variable: "--font-ui",
  display: "swap",
});
const mono = localFont({
  src: "./fonts/JetBrainsMono.ttf",
  weight: "100 800",
  style: "normal",
  adjustFontFallback: false,
  variable: "--font-mono",
  display: "swap",
});
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ToastProvider } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  metadataBase: new URL("https://mytaillog.com"),
  title: {
    default: "MyTailLog — digitize your aircraft logbooks",
    template: "%s · MyTailLog",
  },
  description:
    "Free, open-source logbook digitizer & maintenance tracker for GA owners. AI reads your paper airframe/engine/prop logbooks into a searchable index — AD/SB tracking, maintenance forecasting, weight & balance, and reminders before things come due.",
  keywords: [
    "aircraft logbook",
    "aircraft maintenance tracking",
    "AD compliance",
    "general aviation",
    "logbook digitization",
    "annual inspection tracker",
  ],
  openGraph: {
    type: "website",
    url: "https://mytaillog.com",
    siteName: "MyTailLog",
    title: "MyTailLog — digitize your aircraft logbooks",
    description:
      "Photograph your paper logbooks; AI turns them into a searchable maintenance tracker with AD/SB compliance, forecasting, and due-date reminders. Free & open source.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "MyTailLog" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MyTailLog — digitize your aircraft logbooks",
    description:
      "Free, open-source AI digitizer & maintenance tracker for paper aircraft logbooks.",
    images: ["/og.png"],
  },
  manifest: "/manifest.webmanifest",
  itunes: { appId: "6795396758" },
};

export const viewport: Viewport = {
  themeColor: "#0a0d13",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className={`dark ${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>
        <ToastProvider>
          <AppHeader email={user?.email ?? null} />
          {children}
        </ToastProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
