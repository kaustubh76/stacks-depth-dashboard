/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Neutrals: theme-aware via CSS vars (RGB triples in index.css). The
        //    rgb(var(--c-…) / <alpha-value>) form keeps Tailwind /opacity modifiers
        //    (e.g. bg-panel2/40, border-edge/60) working across light + dark. ──
        base: "#0b0c10",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        panel2: "rgb(var(--c-panel2) / <alpha-value>)",
        edge: "rgb(var(--c-edge) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        sub: "rgb(var(--c-sub) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",

        // ── Brand + signal (Stacks Depth palette; vivid on both themes) ──
        brand: "rgb(var(--c-brand) / <alpha-value>)", // Stacks Depth teal — themeable: bright on dark, darker on light for AA contrast
        up: "#43b581", // depth / "clears the bar" green
        down: "#e0728a", // shortfall / crit rose
        cool: "#3861fb", // one cool secondary (measured-vs-modelled)
        violet: "#8b9dff", // provenance / on-chain

        // ── Legacy utility names kept ALIVE (re-pointed) so reused primitives resolve ──
        neon: "#43b581", // → up
        cyan: "#38b2c4", // → brand teal
        amber: "#d9a23a", // → warn / attention gold
        danger: "#e0728a", // → down
      },
      fontFamily: {
        display: ['"Space Grotesk"', "Inter", "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ['"Space Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderWidth: {
        3: "3px",
      },
      borderRadius: {
        none: "0px",
        sm: "2px",
        DEFAULT: "2px",
        md: "2px",
        lg: "3px",
        xl: "3px",
        "2xl": "4px",
        "3xl": "4px",
        full: "9999px",
      },
      boxShadow: {
        brut: "4px 4px 0 0 var(--brut-shadow)",
        "brut-sm": "2px 2px 0 0 var(--brut-shadow)",
        "brut-lg": "6px 6px 0 0 var(--brut-shadow)",
      },
      keyframes: {
        pulseDot: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.85)" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
