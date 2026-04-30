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
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        // Делим тяжёлые сторонние библиотеки на отдельные чанки —
        // браузер кеширует их между релизами и быстрее парсит.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-globe.gl") || id.includes("/three") || id.includes("three/")) return "vendor-3d";
          if (id.includes("leaflet") || id.includes("react-leaflet")) return "vendor-leaflet";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("react-router-dom") || id.includes("@remix-run")) return "vendor-router";
          if (id.includes("react-dom") || id.includes("scheduler") || /\/react\//.test(id)) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
    ],
  },
});
