import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const basePath = process.env.BASE_PATH ?? "/";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@assets": path.resolve(__dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    allowedHosts: true,
    fs: {
      strict: false,
    },
    proxy: {
      "/api": {
        target: process.env.API_SERVER_URL || "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
