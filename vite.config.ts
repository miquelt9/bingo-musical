import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  base: process.env.NODE_ENV === "production" ? "/bingo-musical/" : "/",
  server: {
    // Spotify requires HTTPS redirect URIs (and disallows "localhost").
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-jspdf": ["jspdf"],
        },
      },
    },
  },
});
