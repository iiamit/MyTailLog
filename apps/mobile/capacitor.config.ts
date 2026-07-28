import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mytaillog.app",
  appName: "MyTailLog",
  webDir: "dist",
  // Route fetch() through the native HTTP stack so calls to mytaillog.com and
  // Supabase aren't subject to browser CORS (there are no CORS headers on the
  // API — access is gated by the Bearer token, not the origin).
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;
