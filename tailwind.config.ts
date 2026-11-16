import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#eef2f8", 100: "#d9e2f0", 200: "#b3c4e0", 300: "#869fc8", 400: "#5578aa",
          500: "#375a8c", 600: "#284670", 700: "#1d3558", 800: "#142645", 900: "#0b1f3a", 950: "#07142a",
        },
        brand: { DEFAULT: "#1f9d6b", dark: "#167a53", light: "#e3f5ed" },
        surface: "#f4f6fa",
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
