import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
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

/**
 * GitHub Pages serves the production SPA at /bingo-musical/.
 * Workers Builds (WORKERS_CI=1) and `npm run build:worker` serve it at the workers.dev root.
 * VITE_BASE overrides both.
 */
function resolveAssetBase(): string {
  if (process.env.VITE_BASE) return process.env.VITE_BASE;
  if (process.env.WORKERS_CI === "1") return "/";
  return process.env.NODE_ENV === "production" ? "/bingo-musical/" : "/";
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [stripPcUiFontImport(), react(), emitVersionJson()],
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId),
  },
  base: resolveAssetBase(),
  server: {
    host: "localhost",
    port: 5173,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
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
