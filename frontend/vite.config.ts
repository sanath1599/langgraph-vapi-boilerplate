import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy all backend API under /api so frontend routes (/users, /appointments, etc.)
// are never proxied. Reload on /appointments then serves index.html and React Router works.
const API_PREFIX = "/api";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      [API_PREFIX]: {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(new RegExp(`^${API_PREFIX.replace(/\/$/, "")}`), ""),
      },
    },
  },
});
