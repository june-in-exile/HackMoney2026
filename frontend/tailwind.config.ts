import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#e0f2ff",
          100: "#b3e0ff",
          200: "#80ccff",
          300: "#4db8ff",
          400: "#1aa3ff",
          500: "#0088ff",
          600: "#0070dd",
          700: "#0059bb",
          800: "#004299",
          900: "#002b77",
        },
        cyber: {
          blue: "#00d9ff",
          "blue-glow": "#0088ff",
          purple: "#9d00ff",
          "purple-light": "#c77dff",
          pink: "#ff00ff",
          magenta: "#d946ef",
          black: "#0a0a0f",
          "dark-bg": "#050508",
          "card-bg": "#0f0f18",
          "teal": "#0a1a2a",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "flicker": "flicker 0.15s infinite",
        "ocean-flow": "oceanFlow 20s ease-in-out infinite",
        "marquee": "marquee 30s linear infinite",
        "scan": "scan 4s ease-in-out infinite",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px #00d9ff, 0 0 10px #00d9ff" },
          "100%": { boxShadow: "0 0 10px #00d9ff, 0 0 20px #00d9ff, 0 0 30px #0088ff" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
        oceanFlow: {
          "0%, 100%": { transform: "scale(1.05) translateX(0%) translateY(0%)" },
          "25%": { transform: "scale(1.08) translateX(-2%) translateY(-1%)" },
          "50%": { transform: "scale(1.06) translateX(1%) translateY(1%)" },
          "75%": { transform: "scale(1.07) translateX(-1%) translateY(-0.5%)" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "10%": { opacity: "1" },
          "90%": { opacity: "1" },
          "100%": { transform: "translateY(300%)", opacity: "0" },
        },
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgba(0, 217, 255, 0.5)",
        "glow": "0 0 20px rgba(0, 217, 255, 0.6), 0 0 40px rgba(0, 136, 255, 0.4)",
        "glow-lg": "0 0 30px rgba(0, 217, 255, 0.7), 0 0 60px rgba(0, 136, 255, 0.5)",
        "inner-glow": "inset 0 0 20px rgba(0, 217, 255, 0.3)",
        "purple-glow": "0 0 20px rgba(157, 0, 255, 0.4), 0 0 40px rgba(157, 0, 255, 0.2)",
        "mixed-glow": "0 0 15px rgba(0, 217, 255, 0.5), 0 0 30px rgba(157, 0, 255, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
