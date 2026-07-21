/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        softblue: "#eaf3fb",
        calmblue: "#5b8def",
        skyblue: "#7ec8f5",
        lightgreen: "#e6f7ef",
        mintgreen: "#4fbf8b",
        purpleaccent: "#8b7cf6",
        softpurple: "#c7b8fb",
        // Premium calming gradient background palette
        bgblue: "#EEF7FF",
        bggreen: "#E6F4EA",
        bgpurple: "#F3E8FF",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(91,141,239,0.15), 0 8px 30px -8px rgba(91,141,239,0.35)",
        "glow-purple": "0 0 0 1px rgba(139,124,246,0.18), 0 8px 30px -8px rgba(139,124,246,0.4)",
        premium: "0 8px 32px -8px rgba(30,41,59,0.12), 0 2px 8px -2px rgba(30,41,59,0.06)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out both",
        "float-slow": "floatSlow 6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0, transform: "translateY(8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
    },
  },
  plugins: [],
};
