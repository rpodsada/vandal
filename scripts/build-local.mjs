// Local release build with a build number (PLAN Versioning › Build numbers).
// Run from the repo root:
//
//   npm run build:local                    installer, e.g. Vandal_0.3.0-beta.3+5_x64-setup.exe
//   npm run build:local -- --no-bundle     just the release exe
//
// The version comes from git (see localBuildVersion), so nothing in the repo
// changes: it reaches Tauri through a --config overlay and the About page
// through VITE_BUILD_* variables.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { localBuildVersion } from "./releaseLib.mjs";

const TARGET = "src-tauri/target";
const OVERLAY = `${TARGET}/local-build.conf.json`;

function fail(message) {
  console.error(`build:local: ${message}`);
  process.exit(1);
}

let describe;
try {
  describe = execFileSync("git", ["describe", "--tags", "--match", "v*", "--long", "--dirty"], {
    encoding: "utf8",
  });
} catch {
  fail("git describe found no v* release tag (try `git fetch --tags`)");
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
let build;
try {
  build = localBuildVersion(describe, pkg.version);
} catch (e) {
  fail(e.message);
}
const { version, commit, modified, untagged } = build;

console.log(`build:local: Vandal ${version} (${commit}${modified ? ", modified" : ""})`);
if (modified) console.warn('build:local: uncommitted changes: About will say "modified"');
if (untagged)
  console.warn(`build:local: v${version} isn't tagged yet; this is its release candidate`);

mkdirSync(TARGET, { recursive: true });
writeFileSync(OVERLAY, JSON.stringify({ version }, null, 2) + "\n");

const extra = process.argv.slice(2);
// One command string: npm is npm.cmd on Windows, which needs a shell, and Node
// deprecates passing an argument array along with `shell`.
const quote = (arg) => (/^[\w./:=-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`);
const command = ["npm run tauri -- build --config", OVERLAY, ...extra.map(quote)].join(" ");
const result = spawnSync(command, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    VITE_BUILD_VERSION: version,
    VITE_BUILD_COMMIT: commit,
    VITE_BUILD_MODIFIED: modified ? "1" : "",
  },
});
if (result.status !== 0) fail(`tauri build failed (exit ${result.status ?? result.signal})`);

const output = extra.includes("--no-bundle")
  ? `${TARGET}/release/vandal.exe`
  : `${TARGET}/release/bundle/nsis/Vandal_${version}_x64-setup.exe`;
if (existsSync(output)) console.log(`\nbuild:local: Vandal ${version} built:\n  ${output}`);
else console.warn(`\nbuild:local: done, but ${output} isn't there; check the bundle folder`);
