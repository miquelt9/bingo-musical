import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const buildId = process.env.VITE_BUILD_ID || "dev";

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

function emitVersionJson(): Plugin {
  return {
    name: "emit-version-json",
    writeBundle() {
      const outDir = resolve(__dirname, "dist");
      writeFileSync(resolve(outDir, "version.json"), JSON.stringify({ buildId }));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [stripPcUiFontImport(), react(), emitVersionJson()],
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId),
  },
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
