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
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, ".."),
        path.resolve(__dirname),
      ],
    },
  },
});
