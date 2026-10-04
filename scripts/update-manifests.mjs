// Writes the updater's channel manifests (PLAN 3P.2). Run from the repo root:
//
//   node scripts/update-manifests.mjs --out <dir> [--manual]
//
// Reads this repo's published releases from the GitHub API, picks what each
// channel offers (updateManifestsLib.mjs), downloads that installer and its .sig,
// checks the signature against tauri.conf.json's public key, and writes
// <dir>/beta.json and <dir>/stable.json. publish-updates.yml runs it in a
// checkout of the update-manifests branch and commits the result. Without
// --manual (a release was just published) a channel only moves up; with it, the
// channels are set to whatever the releases say. Nothing is pushed from here, so
// running it locally into a temp folder is a dry run.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import {
  CHANNELS,
  channelRelease,
  manifest,
  shouldWrite,
  verifySignature,
} from "./updateManifestsLib.mjs";

function fail(message) {
  console.error(`update-manifests: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = outIndex >= 0 ? args[outIndex + 1] : null;
if (!out || !existsSync(out)) fail("pass --out <existing folder>");
const manual = args.includes("--manual");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const repo = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(pkg.repository ?? "")?.[1];
if (!repo) fail(`package.json "repository" should be "github:owner/repo"`);
const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const pubkey = conf.plugins?.updater?.pubkey;
if (!pubkey) fail("tauri.conf.json has no plugins.updater.pubkey");

const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "vandal-update-manifests",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function get(url, as) {
  const res = await fetch(url, {
    headers: as === "json" ? headers : { "User-Agent": headers["User-Agent"] },
  });
  if (!res.ok) fail(`${res.status} ${res.statusText} for ${url}`);
  return as === "json" ? res.json() : Buffer.from(await res.arrayBuffer());
}

const releases = [];
for (let page = 1; ; page++) {
  const batch = await get(
    `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,
    "json",
  );
  releases.push(...batch);
  if (batch.length < 100) break;
}
console.log(
  `update-manifests: ${releases.length} releases in ${repo}${manual ? " (manual run)" : ""}`,
);

const checked = new Map(); // tag -> .sig text, so a release both channels offer is fetched once
for (const channel of CHANNELS) {
  const file = join(out, `${channel}.json`);
  const current = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).version : null;
  const pick = channelRelease(releases, channel);
  const next = pick?.version ?? null;

  if (!shouldWrite(current, next, { manual })) {
    const why =
      next === current ? "unchanged" : `a publish doesn't move it down to ${next ?? "nothing"}`;
    console.log(`  ${channel}: ${current ?? "none"} (${why})`);
    continue;
  }
  if (!pick) {
    rmSync(file);
    console.log(`  ${channel}: ${current} -> none (no signed release left; manifest removed)`);
    continue;
  }

  let sig = checked.get(pick.release.tag_name);
  if (!sig) {
    sig = (await get(pick.signature.browser_download_url)).toString("utf8");
    const installer = await get(pick.installer.browser_download_url);
    try {
      verifySignature(installer, sig, pubkey);
    } catch (e) {
      fail(`${pick.installer.name}: ${e.message}; not offering it`);
    }
    checked.set(pick.release.tag_name, sig);
  }
  writeFileSync(file, JSON.stringify(manifest(pick, sig), null, 2) + "\n");
  console.log(`  ${channel}: ${current ?? "none"} -> ${next} (signature checked)`);
}
