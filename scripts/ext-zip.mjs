// Zips the built browser extension (npm run ext:zip, which builds first),
// into extension/chrome/:
//
//   npm run ext:zip                  vandal-for-chrome-<version>.zip, for loading unpacked
//   npm run ext:zip -- --release     vandal-for-chrome-<version>-release.zip, for the Chrome
//                                    Web Store
//
// The release package leaves out the manifest's `key`: the Web Store gives the
// extension its own ID and doesn't take one in an upload (internal/extension/
// has the listing). The version comes from the manifest. Uses Windows' own
// tar, which writes zip files (-a).
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const release = process.argv.includes("--release");
const dir = resolve(import.meta.dirname, "..", "extension", "chrome");
const dist = join(dir, "dist");
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const zip = join(dir, `vandal-for-chrome-${manifest.version}${release ? "-release" : ""}.zip`);
// Git Bash puts GNU tar first on PATH, which can't write zip files.
const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");

let source = dist;
let staging;
if (release) {
  staging = mkdtempSync(join(tmpdir(), "vandal-ext-"));
  cpSync(dist, staging, { recursive: true });
  delete manifest.key;
  writeFileSync(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2));
  source = staging;
}

try {
  rmSync(zip, { force: true });
  execFileSync(tar, ["-a", "-c", "-f", zip, "-C", source, "."], { stdio: "inherit" });
  console.log(`Zipped ${zip}${release ? " (no key: for the Chrome Web Store)" : ""}`);
} finally {
  if (staging) rmSync(staging, { recursive: true, force: true });
}
