// Pure helpers for scripts/update-manifests.mjs (PLAN 3P.2): which release each
// update channel offers, its manifest, and the updater signature check. No file
// or network access here, so everything is unit-tested (updateManifestsLib.test.mjs).

import { createHash, createPublicKey, verify } from "node:crypto";
import { compareVersions, parseVersion, versionFromTag } from "./releaseLib.mjs";

export const CHANNELS = ["beta", "stable"];

/** The manifest's platform key for our only target (the plugin also tries `-nsis`). */
const PLATFORM = "windows-x86_64";

/**
 * The release a channel offers: the highest published version with an installer
 * and its updater signature. Stable skips prereleases; Beta takes everything, so
 * beta testers move on to the final release. `releases` are GitHub API objects.
 * Returns `{ version, release, installer, signature }` (assets) or null.
 */
export function channelRelease(releases, channel) {
  let best = null;
  for (const release of releases) {
    if (release.draft) continue;
    const version = versionFromTag(release.tag_name);
    if (!version) continue;
    if (channel === "stable" && parseVersion(version).pre.length) continue;
    const installer = release.assets.find((a) => a.name.endsWith("-setup.exe"));
    const signature = installer && release.assets.find((a) => a.name === `${installer.name}.sig`);
    if (!signature) continue; // Releases before 3P.1 have no .sig.
    if (!best || compareVersions(version, best.version) > 0) {
      best = { version, release, installer, signature };
    }
  }
  return best;
}

/** The updater's static manifest for one release (`signature` is the .sig file's text). */
export function manifest({ version, release, installer }, signature) {
  return {
    version,
    notes: release.body ?? "",
    pub_date: release.published_at,
    platforms: {
      [PLATFORM]: { signature: signature.trim(), url: installer.browser_download_url },
    },
  };
}

/**
 * Whether to write a channel's new manifest. A publish only moves a channel up,
 * so publishing an older release late can't take it back. A manual run sets it
 * to whatever the releases say: that's how a bad release is pulled (turn it back
 * into a draft, then run the workflow by hand).
 */
export function shouldWrite(currentVersion, nextVersion, { manual }) {
  if (nextVersion === currentVersion) return false;
  if (manual || !currentVersion) return true;
  if (!nextVersion) return false;
  return compareVersions(nextVersion, currentVersion) > 0;
}

// Minisign, as Tauri uses it: the public key and the .sig are base64 of the
// minisign files' text. A key line is "Ed" + key ID (8 bytes) + Ed25519 key (32);
// a signature line is "ED" (BLAKE2b-512 of the file is signed) or "Ed" (the file
// itself) + key ID + signature (64), and the global signature covers the
// signature plus the trusted comment.

function minisignLines(base64Text, what) {
  const lines = Buffer.from(base64Text.trim(), "base64").toString("utf8").split(/\r?\n/);
  if (!lines[0]?.startsWith("untrusted comment:")) throw new Error(`Not a minisign ${what}`);
  return lines;
}

/** The key ID as minisign prints it (`7EF3D52E75FC25DB`). */
function keyIdText(bytes) {
  return Buffer.from(bytes).reverse().toString("hex").toUpperCase();
}

export function parsePublicKey(base64Text) {
  const raw = Buffer.from(minisignLines(base64Text, "public key")[1], "base64");
  if (raw.length !== 42 || raw.subarray(0, 2).toString() !== "Ed") {
    throw new Error("Not an Ed25519 minisign public key");
  }
  return { keyId: keyIdText(raw.subarray(2, 10)), key: raw.subarray(10) };
}

/**
 * Checks a Tauri updater signature (.sig text) for `data` against the public key
 * (tauri.conf.json's `plugins.updater.pubkey`). Throws with the reason if it
 * fails; returns the signed trusted comment ("timestamp:… file:… version:…").
 */
export function verifySignature(data, sigText, pubkeyText) {
  const pub = parsePublicKey(pubkeyText);
  const lines = minisignLines(sigText, "signature");
  const sig = Buffer.from(lines[1] ?? "", "base64");
  const trusted = /^trusted comment: (.*)$/.exec(lines[2] ?? "");
  const global = Buffer.from(lines[3] ?? "", "base64");
  if (sig.length !== 74 || !trusted || global.length !== 64) throw new Error("Malformed signature");

  const alg = sig.subarray(0, 2).toString();
  if (alg !== "ED" && alg !== "Ed") throw new Error(`Unknown signature algorithm ${alg}`);
  const keyId = keyIdText(sig.subarray(2, 10));
  if (keyId !== pub.keyId) throw new Error(`Signed with key ${keyId}, not ${pub.keyId}`);

  const key = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: pub.key.toString("base64url") },
    format: "jwk",
  });
  const signed = alg === "ED" ? createHash("blake2b512").update(data).digest() : data;
  if (!verify(null, signed, key, sig.subarray(10))) throw new Error("Bad signature for this file");
  const comment = Buffer.concat([sig.subarray(10), Buffer.from(trusted[1], "utf8")]);
  if (!verify(null, comment, key, global)) throw new Error("Bad signature on the trusted comment");
  return trusted[1];
}

/**
 * The version a trusted comment says the file was signed for (Tauri's CLI
 * writes `version:<v>`), or null. The app requires it to match the manifest
 * (`requireSignedVersion`), so a manifest can't pass off an older release.
 */
export function signedVersion(trustedComment) {
  return /(?:^|\t)version:([^\t]+)/.exec(trustedComment)?.[1] ?? null;
}
