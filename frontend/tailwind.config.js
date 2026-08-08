/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 南网科技色：白底 + 南网蓝，青色仅作数字化状态辅助色
        csg: {
          50: "#F1F7FD",
          100: "#DDECF9",
          200: "#B9D8F1",
          300: "#86BCE5",
          400: "#4D9BD3",
          500: "#237AB9",
          600: "#075FA5",
          700: "#064D88",
          800: "#083F6F",
          900: "#0A345B",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0, 71, 133, 0.05), 0 12px 32px rgba(0, 71, 133, 0.08)",
      },
    },
  },
  plugins: [],
};
