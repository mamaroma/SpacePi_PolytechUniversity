import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
      "/sdr": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    // NOTE: не используем manualChunks — recharts/d3/three имеют круговые
    // зависимости и при явном дроблении Rollup выдаёт
    // «Cannot access '...' before initialization».
    // Vite сам разбивает vendor-бандл достаточно хорошо благодаря lazy-imports.
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
    ],
  },
});
