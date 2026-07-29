/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 南网蓝：近似 Pantone 654C（C100 M69 Y0 K38）
        csg: {
          50: "#F0F5FB",
          100: "#DCE8F5",
          200: "#B5CEE8",
          300: "#7AA8D4",
          400: "#3D7FBE",
          500: "#1A5FA8",
          600: "#003B8E",
          700: "#002F72",
          800: "#00245A",
          900: "#001A42",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0, 59, 142, 0.04), 0 8px 24px rgba(0, 59, 142, 0.06)",
      },
    },
  },
  plugins: [],
};
