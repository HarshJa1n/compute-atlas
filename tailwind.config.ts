import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#09131c",
        surface: "#122330",
        raised: "#17303f",
        line: "#1f3d4f",
        paper: "#f4f7f8",
        ink: "#f0f5f7",
        muted: "#a8bac7",
        active: "#43dfc3",
        info: "#7ebbff",
        caution: "#ffcc75",
        danger: "#ff8e91",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { control: "8px", panel: "12px" },
      transitionDuration: { fast: "180ms", panel: "240ms" },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        pulseline: { "0%,100%": { opacity: "0.35" }, "50%": { opacity: "1" } },
      },
      animation: { rise: "rise 240ms ease-out both", pulseline: "pulseline 1.6s ease-in-out infinite" },
    },
  },
  plugins: [],
} satisfies Config;
