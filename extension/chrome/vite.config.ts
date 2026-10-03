// Builds the Chrome extension (PLAN 3N) into extension/chrome/dist, the folder
// to load unpacked. public/ (manifest, icons) is copied as is.
import { resolve } from "node:path";
import process from "node:process";
import { defineConfig } from "vite";

const dir = import.meta.dirname;

export default defineConfig({
  root: dir,
  base: "./",
  build: {
    outDir: "dist",
    // Not while watching: the content-script watcher writes here too (ext:dev).
    emptyOutDir: !process.argv.includes("--watch"),
    target: "chrome116",
    // The preload polyfill would be inline script, which extension pages forbid.
    modulePreload: false,
    rolldownOptions: {
      input: {
        popup: resolve(dir, "popup.html"),
        result: resolve(dir, "result.html"),
        options: resolve(dir, "options.html"),
        background: resolve(dir, "src/background.ts"),
      },
      output: {
        // The manifest names background.js.
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
