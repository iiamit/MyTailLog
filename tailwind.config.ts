import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Urgency palette used by the maintenance "due list" (Phase 2).
        due: {
          overdue: "#dc2626",
          soon: "#d97706",
          upcoming: "#16a34a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
