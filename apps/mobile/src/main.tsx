import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App } from "./App";
// Self-hosted brand faces. The design links Google Fonts, but this app is
// offline-first — a hangar with no signal must still render its own typography,
// so the woff2 files ship in the bundle instead of being fetched.
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "./index.css";

// Light status-bar text on the dark ground, and let our content sit under it
// (we already pad for the safe-area inset). Native only; ignore failures.
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
