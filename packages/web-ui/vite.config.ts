import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const backendOrigin = "http://127.0.0.1:8080";
const backend: ProxyOptions = {
  target: backendOrigin,
  changeOrigin: true,
  ws: true,
  headers: { origin: backendOrigin },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/v1": backend,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@hermes/shared": path.resolve(import.meta.dirname, "../shared/src"),
    },
    dedupe: ["react", "react-dom"],
  },
});
