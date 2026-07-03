import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ToastProvider } from "@/components/Toast";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "MyTailLog — aircraft logbook index",
  description:
    "Digitize and search your airframe, engine, and prop logbooks. An index and decision-support layer, not the legal maintenance record.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
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
    <html lang="en">
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
