import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
const port = rawPort === undefined ? undefined : Number(rawPort);

if (port !== undefined && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";
const isReplitDev =
  process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const devPlugins = isReplitDev
  ? [
      await import("@replit/vite-plugin-cartographer").then((m) =>
        m.cartographer({
          root: path.resolve(__dirname, ".."),
        }),
      ),
      await import("@replit/vite-plugin-dev-banner").then((m) =>
        m.devBanner(),
      ),
    ]
  : [];

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss(), runtimeErrorOverlay(), ...devPlugins],
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
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    ...(port ? { port, strictPort: true } : {}),
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
    ...(port ? { port } : {}),
  },
});
