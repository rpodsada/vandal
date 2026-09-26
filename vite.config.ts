/// <reference types="vitest/config" />
import { resolve } from "node:path";
import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const page = (name: string) => resolve(import.meta.dirname, `${name}.html`);

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // One entry per window type so the overlay bundle stays tiny (PLAN §4.1).
  build: {
    rolldownOptions: {
      input: {
        overlay: page("overlay"),
        editor: page("editor"),
        settings: page("settings"),
      },
    },
  },

  // Tauri: don't obscure Rust errors; fixed port; don't watch src-tauri.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },

  test: {
    include: ["src/**/*.test.ts"],
  },
}));
