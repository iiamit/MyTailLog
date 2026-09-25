import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
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

// Match system-bar text to the first dark paint. Theme changes update it later.
if (Capacitor.getPlatform() === "ios") {
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
} else if (Capacitor.getPlatform() === "android") {
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
