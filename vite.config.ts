import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-jspdf": ["jspdf"],
          "vendor-html2canvas": ["html2canvas"],
          "vendor-charts": ["recharts"],
        },
      },
    },
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  optimizeDeps: {
    // Avoid late discovery re-optimization for Checkbox that can trigger 504 outdated dep responses.
    include: ["@radix-ui/react-checkbox"],
    // Refresh optimized cache at dev startup to prevent stale browserHash mismatches.
    force: true,
  },
}));
