import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "/football/",
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
    // Force all react imports (including from ../shared) to resolve
    // from football/node_modules — fixes Vercel monorepo builds
    dedupe: ["react", "react-dom"],
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress react externalization warning — handled by dedupe
        if (warning.code === "UNRESOLVED_IMPORT") return;
        warn(warning);
      },
    },
  },
  server: {
    host: true,
    allowedHosts: ['all'],
    fs: {
      allow: [
        path.resolve(__dirname, ".."),
        path.resolve(__dirname),
      ],
    },
    // Proxy /api calls to the deployed Vercel backend so dev mode works without vercel dev.
    // Points at the MAIN-branch preview — always reflects the latest deployed API.
    // (Previously pointed at working-branch preview but that build got stuck and served
    // stale code, causing spurious 400s on newer metrics like session_score.)
    proxy: {
      '/api': {
        target: 'https://replay-mod-git-main-john-tangs-projects-1c51aca7.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
