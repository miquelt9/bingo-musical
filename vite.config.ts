import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** pc-ui.css @imports Google Fonts; index.html already loads them via <link>. */
function stripPcUiFontImport(): Plugin {
  const fontImport =
    /@import\s+url\(["']?https:\/\/fonts\.googleapis\.com\/css2\?family=Source\+Code\+Pro[^)]+\)["']?\s*;?/g;
  return {
    name: "strip-pc-ui-font-import",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("pc-ui") || !id.endsWith(".css") || !fontImport.test(code)) return null;
      fontImport.lastIndex = 0;
      return { code: code.replace(fontImport, ""), map: null };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [stripPcUiFontImport(), react()],
  base: process.env.NODE_ENV === "production" ? "/bingo-musical/" : "/",
  server: {
    host: "localhost",
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
