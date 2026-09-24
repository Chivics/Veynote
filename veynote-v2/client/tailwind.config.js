/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // Tokens copied 1:1 from the approved Veynote V2 board (§5 design system)
        app: {
          bg: "rgb(var(--app-bg) / <alpha-value>)",
          panel: "rgb(var(--app-panel) / <alpha-value>)",
          panel2: "rgb(var(--app-panel2) / <alpha-value>)",
          border: "rgb(var(--app-border) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          soft: "rgb(var(--ink-soft) / <alpha-value>)",
        },
        accent: {
          notes: "rgb(var(--accent-notes) / <alpha-value>)",
          "notes-soft": "rgb(var(--accent-notes) / .14)",
          trade: "rgb(var(--accent-trade) / <alpha-value>)",
          "trade-soft": "rgb(var(--accent-trade) / .14)",
          gold: "rgb(var(--accent-gold) / <alpha-value>)",
        },
        success: "rgb(var(--success) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
      },
      borderRadius: {
        card: "13px",
        panel: "15px",
      },
    },
  },
  plugins: [],
};
