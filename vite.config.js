import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/budget-app/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "robots.txt"],
      manifest: {
        name: "FlowMetrics Budget",
        short_name: "FlowMetrics",
        description: "A modern budget and cash-flow tracking app",
        start_url: "/budget-app/",
        scope: "/budget-app/",
        display: "standalone",
        background_color: "#0b1220",
        theme_color: "#0b1220",
        icons: [
          {
            src: "/budget-app/pwa-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/budget-app/pwa-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ],
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
});
