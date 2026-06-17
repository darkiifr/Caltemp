import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;
const uiVendorModules = [
  "framer-motion",
  "lucide-react",
  "@radix-ui/react-dialog",
  "@radix-ui/react-tooltip",
];
const tauriVendorModules = [
  "@tauri-apps/api",
  "@tauri-apps/plugin-os",
  "@tauri-apps/plugin-notification",
];

function manualChunks(id) {
  if (!id.includes("node_modules")) return undefined;
  if (uiVendorModules.some((moduleName) => id.includes(`/node_modules/${moduleName}/`) || id.includes(`\\node_modules\\${moduleName}\\`))) {
    return "vendor-ui";
  }
  if (tauriVendorModules.some((moduleName) => id.includes(`/node_modules/${moduleName}/`) || id.includes(`\\node_modules\\${moduleName}\\`))) {
    return "vendor-tauri";
  }
  return undefined;
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks,
      }
    }
  },
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
