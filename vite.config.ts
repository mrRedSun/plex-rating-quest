import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    minify: "esbuild",
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id): string | undefined {
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) return "vendor-motion";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/") || id.includes("/zustand/")) return "vendor-react";
          if (id.includes("/lucide-react/")) return "vendor-ui";
          if (id.includes("/zod/")) return "vendor-validation";
          return undefined;
        },
      },
    },
  },
});
