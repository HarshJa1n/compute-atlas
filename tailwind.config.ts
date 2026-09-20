import type { Config } from "tailwindcss";

// Design tokens. Status is never colour alone: every state also carries a glyph
// and a word (see components/panels/ui.tsx), so these hues only need to be
// distinct from each other and from the brand accent.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0d12",
        surface: "#10151c",
        raised: "#171e28",
        line: "#22303d",
        paper: "#f4f6f8",
        ink: "#f2f4f7",
        muted: "#8b98a9",
        // Brand accent: selection, primary actions, focus. Periwinkle reads
        // clearly on a dark basemap without colliding with any status hue.
        brand: "#8b9eff",
        active: "#3dd68c", // pass
        danger: "#ff6b7a", // fail
        caution: "#f5b841", // unknown
        conflict: "#c98cff", // two sources disagree
        info: "#8b9eff", // links and neutral emphasis
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      borderRadius: { control: "8px", panel: "14px" },
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
