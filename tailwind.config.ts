import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Glass-cockpit tokens (mirror of the CSS vars in globals.css). Namespaced
        // so they don't clobber Tailwind's default slate/red/emerald scales, which
        // older screens still use until they're reskinned.
        bg: "var(--bg)",
        panel: "var(--panel)",
        panel2: "var(--panel2)",
        raise: "var(--raise)",
        line: "var(--line)",
        line2: "var(--line2)",
        ink: "var(--ink)",
        dim: "var(--dim)",
        faint: "var(--faint)",
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
        },
        annun: {
          green: "var(--grn)",
          amber: "var(--amb)",
          red: "var(--red)",
        },
        book: {
          airframe: "var(--book-airframe)",
          engine: "var(--book-engine)",
          prop: "var(--book-prop)",
          avionics: "var(--book-avionics)",
          other: "var(--book-other)",
        },
        // Urgency palette used by the maintenance "due list".
        due: {
          overdue: "#dc2626",
          soon: "#d97706",
          upcoming: "#16a34a",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-ui)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        pin: {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(90,169,255,.55)" },
          "50%": { boxShadow: "0 0 0 7px rgba(90,169,255,0)" },
        },
        up: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        pin: "pin 2s infinite",
        up: "up .3s ease",
      },
    },
  },
  plugins: [],
};

export default config;
