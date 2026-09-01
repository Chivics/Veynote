/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        // Tokens copied 1:1 from the approved Veynote V2 board (§5 design system)
        app: {
          bg: "#080a0d",
          panel: "#101318",
          panel2: "#151920",
          border: "#252a33",
        },
        ink: {
          DEFAULT: "#f4f6f8",
          muted: "#8d96a5",
          soft: "#b6beca",
        },
        accent: {
          notes: "#7c6cff",
          "notes-soft": "rgba(124,108,255,.14)",
          trade: "#5fa8ff",
          "trade-soft": "rgba(95,168,255,.14)",
        },
        success: "#38d39f",
        danger: "#ff6878",
        warning: "#f5b942",
      },
      borderRadius: {
        card: "13px",
        panel: "15px",
      },
    },
  },
  plugins: [],
};
