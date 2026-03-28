import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
    // Force all react imports (including from ../shared) to resolve
    // from basketball/node_modules — fixes Vercel monorepo builds
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
    allowedHosts: ['all'],
    fs: {
      allow: [
        path.resolve(__dirname, ".."),
        path.resolve(__dirname),
      ],
    },
  },
});