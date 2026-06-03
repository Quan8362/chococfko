import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#241a17",
        cream: "#faf4ea",
        paper: "#fffdf8",
        rose: {
          DEFAULT: "#c2185b",
          deep: "#9d1248",
          soft: "#fbedf3",
          medium: "#e0607e",
        },
        teal: {
          DEFAULT: "#1f8fa6",
          soft: "#e6f3f6",
        },
        gold: {
          DEFAULT: "#c99a3d",
          light: "#f5e8cc",
        },
        muted: "#8c7c70",
        line: "#e8ddcf",
      },
      fontFamily: {
        serif: ["var(--font-serif-display)", "Georgia", "serif"],
        sans: ["var(--font-bvp)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 16px rgba(36,26,23,0.06)",
        "card-hover": "0 8px 32px rgba(36,26,23,0.12)",
        nav: "0 1px 0 #e8ddcf",
        dropdown: "0 8px 32px rgba(36,26,23,0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
