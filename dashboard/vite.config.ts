import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Convox's partner dashboard (React + shadcn), reused. Built into client/app, served at /app.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/app/",
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { outDir: "../client/app", emptyOutDir: true },
  server: { port: 5173, proxy: { "/dashboard": "http://127.0.0.1:8000" } },
});
