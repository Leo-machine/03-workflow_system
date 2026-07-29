import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 开发时把 /api 代理到本地后端；生产由 nginx 反代（见 nginx.conf）
      "/api": "http://localhost:8000",
    },
  },
});
