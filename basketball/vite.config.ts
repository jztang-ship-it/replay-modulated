import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // allow reading files from the repo root (one level above /apps)
      allow: [
        path.resolve(__dirname, "..", ".."), // <repo-root>
        path.resolve(__dirname), // replay-ui
      ],
    },
  },
});
