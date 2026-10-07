import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ember: {
          50: "#FFF4ED",
          100: "#FFE0C7",
          200: "#FFC199",
          300: "#FF9B5C",
          400: "#FF7A2F",
          500: "#F65C0A",
          600: "#D24806",
          700: "#A83705",
          800: "#7C2A08",
          900: "#4A1A08",
        },
        ash: {
          50: "#F7F6F4",
          100: "#EDEBE7",
          200: "#D9D5CE",
          300: "#BDB8B0",
          400: "#948E85",
          500: "#6E6862",
          600: "#524D48",
          700: "#3B3733",
          800: "#26231F",
          900: "#16140F",
        },
        moss: {
          50: "#F3F8F0",
          100: "#E0EEDB",
          200: "#BFDCB5",
          300: "#93C283",
          400: "#67A455",
          500: "#4A8538",
          600: "#386A2A",
          700: "#2A5020",
          800: "#1D3817",
          900: "#12230E",
        },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Microsoft YaHei",
          "PingFang SC",
          "sans-serif",
        ],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.72" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        flicker: "flicker 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
