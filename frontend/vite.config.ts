import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // 与根目录 .env 的 BACKEND_PORT / VITE_DEV_PORT 对齐（也可在 frontend/.env 覆盖）
  const env = loadEnv(mode, process.cwd(), "");
  const rootEnv = loadEnv(mode, "..", "");
  const backendPort = env.VITE_BACKEND_PORT || rootEnv.BACKEND_PORT || "8001";
  const devPort = Number(env.VITE_DEV_PORT || rootEnv.VITE_DEV_PORT || 5174);

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: devPort,
      proxy: {
        // 开发时把 /api 代理到本地后端；生产由 nginx 反代（见 nginx.conf）
        "/api": `http://localhost:${backendPort}`,
      },
    },
  };
});
