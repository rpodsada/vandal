// Registers the dev build (src-tauri/target/debug/vandal.exe) as the browser
// extension's native messaging host `com.vandal.desktop.dev`, for Chrome, Edge,
// Brave and Chromium, per user (PLAN 3N.7). The installer registers
// `com.vandal.desktop` for installed copies the same way (windows/hooks.nsh).
//
//   npm run ext:host-dev            register
//   npm run ext:host-dev -- --remove
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const NAME = "com.vandal.desktop.dev";
// The Chrome Web Store install, then unpacked builds (the manifest's `key`).
const EXTENSION_IDS = ["glniniimcccgnpgfddfdepdnpbajpnfc", "bmloooliddgohojbpadiljacckgdbngm"];
const BROWSERS = ["Google\\Chrome", "Microsoft\\Edge", "BraveSoftware\\Brave-Browser", "Chromium"];

const dir = join(process.env.LOCALAPPDATA, NAME);
const manifest = join(dir, "native-host.json");
const exe = resolve(import.meta.dirname, "..", "src-tauri", "target", "debug", "vandal.exe");
const keys = BROWSERS.map((b) => `HKCU\\Software\\${b}\\NativeMessagingHosts\\${NAME}`);
const reg = (...args) => execFileSync("reg", args, { stdio: "ignore" });

if (process.argv.includes("--remove")) {
  for (const key of keys) {
    try {
      reg("delete", key, "/f");
    } catch {
      // Not registered for this browser.
    }
  }
  rmSync(dir, { recursive: true, force: true });
  console.log(`Removed ${NAME}.`);
} else {
  mkdirSync(dir, { recursive: true });
  const host = {
    name: NAME,
    description: "Vandal Dev",
    path: exe,
    type: "stdio",
    allowed_origins: EXTENSION_IDS.map((id) => `chrome-extension://${id}/`),
  };
  writeFileSync(manifest, JSON.stringify(host, null, 2));
  for (const key of keys) reg("add", key, "/ve", "/t", "REG_SZ", "/d", manifest, "/f");
  console.log(
    `Registered ${NAME} -> ${exe}\nfor Chrome, Edge, Brave and Chromium. Restart the browser if it was open.`,
  );
}
