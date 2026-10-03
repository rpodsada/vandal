// Builds the content scripts (PLAN 3N.4) into extension/chrome/dist after
// vite.config.ts. Files injected with chrome.scripting can't import, so each
// is one self-contained classic script.
import { resolve } from "node:path";
import { defineConfig } from "vite";

const dir = import.meta.dirname;

export default defineConfig({
  root: dir,
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "chrome116",
    lib: {
      entry: resolve(dir, "src/content/page.ts"),
      formats: ["iife"],
      name: "vandalPage",
      fileName: () => "page.js",
    },
  },
});
