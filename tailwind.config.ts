import type { Config } from "tailwindcss";

/**
 * Palette is the subject's own: the colour temperatures of a theatre rig.
 * house    — the auditorium with everything out
 * plot     — the white ink of a lighting plot on black
 * tungsten — 3200K, the classic warm front wash
 * ct       — Lee 201 Full CT Blue, the cool state
 * special  — the hot centre isolate
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        house: { DEFAULT: "#08080A", raised: "#101014", edge: "#1C1C22" },
        plot: { DEFAULT: "#E8E4DC", dim: "#8A8A93", faint: "#4A4A52" },
        tungsten: "#FFA53D",
        ct: "#4D8FD6",
        special: "#E0457B",
        live: "#5BD98A",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        cue: "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
