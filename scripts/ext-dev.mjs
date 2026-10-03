// Rebuilds the browser extension on every change (npm run ext:dev): the pages
// and worker, and the content scripts, each with its own Vite watcher.
import { spawn } from "node:child_process";

const configs = ["vite.config.ts", "vite.content.config.ts"];
for (const config of configs) {
  spawn("npx", ["vite", "build", "--watch", "-c", `extension/chrome/${config}`], {
    stdio: "inherit",
    shell: true,
  });
}
