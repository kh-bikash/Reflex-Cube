import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: Number(process.env.PORT ?? 8080),
    proxy: {
      // Keeps the dev server same-origin with the API so cookies/SSE work without CORS.
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: "::",
    port: Number(process.env.PORT ?? 8080),
    // `npm run preview` serves the production bundle, which calls its own
    // origin; proxy /api so previewing a build needs no CORS setup either.
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: mode !== "production",
    // The 3D and charting stacks dominate the bundle; splitting them keeps the
    // initial payload small and lets the browser cache them independently.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          charts: ["recharts", "chart.js", "react-chartjs-2"],
          motion: ["framer-motion"],
        },
      },
    },
  },
}));
