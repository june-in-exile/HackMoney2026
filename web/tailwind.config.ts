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
          pink: "#ff00ff",
          black: "#0a0a0f",
          "dark-bg": "#050508",
          "card-bg": "#0f0f18",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "scan": "scan 8s linear infinite",
        "flicker": "flicker 0.15s infinite",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px #00d9ff, 0 0 10px #00d9ff" },
          "100%": { boxShadow: "0 0 10px #00d9ff, 0 0 20px #00d9ff, 0 0 30px #0088ff" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgba(0, 217, 255, 0.5)",
        "glow": "0 0 20px rgba(0, 217, 255, 0.6), 0 0 40px rgba(0, 136, 255, 0.4)",
        "glow-lg": "0 0 30px rgba(0, 217, 255, 0.7), 0 0 60px rgba(0, 136, 255, 0.5)",
        "inner-glow": "inset 0 0 20px rgba(0, 217, 255, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
