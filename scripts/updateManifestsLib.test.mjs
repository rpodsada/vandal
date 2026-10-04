import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  channelRelease,
  manifest,
  parsePublicKey,
  shouldWrite,
  verifySignature,
} from "./updateManifestsLib.mjs";

const b64 = (text) => Buffer.from(text).toString("base64");

/** A minisign key pair in Tauri's format, and a signer for it. */
function minisignKey(keyIdBytes = [1, 2, 3, 4, 5, 6, 7, 8]) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const id = Buffer.from(keyIdBytes);
  const keyLine = Buffer.concat([Buffer.from("Ed"), id, raw]).toString("base64");
  const pubkey = b64(`untrusted comment: minisign public key\n${keyLine}\n`);
  const signFile = (data, comment = "timestamp:1\tfile:test.exe") => {
    const s = sign(null, createHash("blake2b512").update(data).digest(), privateKey);
    const g = sign(null, Buffer.concat([s, Buffer.from(comment)]), privateKey);
    const sigLine = Buffer.concat([Buffer.from("ED"), id, s]).toString("base64");
    return b64(
      `untrusted comment: signature from tauri secret key\n${sigLine}\n` +
        `trusted comment: ${comment}\n${g.toString("base64")}\n`,
    );
  };
  return { pubkey, signFile };
}

function release(tag, { draft = false, sig = true } = {}) {
  const exe = `Vandal_${tag.slice(1)}_x64-setup.exe`;
  const assets = [{ name: exe, browser_download_url: `https://example.test/${tag}/${exe}` }];
  if (sig) assets.push({ name: `${exe}.sig`, browser_download_url: `https://example.test/x.sig` });
  return {
    tag_name: tag,
    draft,
    body: `Notes for ${tag}`,
    published_at: "2026-10-03T00:00:00Z",
    assets,
  };
}

describe("channelRelease", () => {
  const releases = [
    release("v0.3.0-beta.6", { sig: false }),
    release("v0.3.0-beta.8"),
    release("v0.3.0-beta.10"),
    release("v0.3.0-beta.11", { draft: true }),
    release("v0.2.0"),
    release("not-a-version"),
  ];

  it("offers Beta the highest signed, published version", () => {
    expect(channelRelease(releases, "beta").version).toBe("0.3.0-beta.10");
  });

  it("offers Stable only final releases", () => {
    expect(channelRelease(releases, "stable").version).toBe("0.2.0");
  });

  it("offers Beta a final release once it's out", () => {
    expect(channelRelease([...releases, release("v0.3.0")], "beta").version).toBe("0.3.0");
  });

  it("skips releases without an updater signature", () => {
    expect(channelRelease([release("v0.3.0-beta.6", { sig: false })], "beta")).toBeNull();
  });

  it("returns the installer and signature assets", () => {
    const pick = channelRelease([release("v0.3.0-beta.8")], "beta");
    expect(pick.installer.name).toBe("Vandal_0.3.0-beta.8_x64-setup.exe");
    expect(pick.signature.name).toBe("Vandal_0.3.0-beta.8_x64-setup.exe.sig");
  });
});

describe("manifest", () => {
  it("is the updater's static JSON format", () => {
    const pick = channelRelease([release("v0.3.0-beta.8")], "beta");
    expect(manifest(pick, "c2lnbmF0dXJl\n")).toEqual({
      version: "0.3.0-beta.8",
      notes: "Notes for v0.3.0-beta.8",
      pub_date: "2026-10-03T00:00:00Z",
      platforms: {
        "windows-x86_64": {
          signature: "c2lnbmF0dXJl",
          url: "https://example.test/v0.3.0-beta.8/Vandal_0.3.0-beta.8_x64-setup.exe",
        },
      },
    });
  });
});

describe("shouldWrite", () => {
  it("lets a publish only move a channel up", () => {
    expect(shouldWrite("0.3.0-beta.7", "0.3.0-beta.8", { manual: false })).toBe(true);
    expect(shouldWrite("0.3.0-beta.8", "0.3.0-beta.7", { manual: false })).toBe(false);
    expect(shouldWrite("0.3.0-beta.8", null, { manual: false })).toBe(false);
  });

  it("lets a manual run set a channel to what the releases say", () => {
    expect(shouldWrite("0.3.0-beta.8", "0.3.0-beta.7", { manual: true })).toBe(true);
    expect(shouldWrite("0.3.0-beta.8", null, { manual: true })).toBe(true);
  });

  it("writes a channel's first manifest, and skips an unchanged one", () => {
    expect(shouldWrite(null, "0.3.0-beta.7", { manual: false })).toBe(true);
    expect(shouldWrite("0.3.0-beta.7", "0.3.0-beta.7", { manual: true })).toBe(false);
    expect(shouldWrite(null, null, { manual: true })).toBe(false);
  });
});

describe("verifySignature", () => {
  const data = Buffer.from("installer bytes");

  it("accepts a signature from the configured key", () => {
    const { pubkey, signFile } = minisignKey();
    expect(() => verifySignature(data, signFile(data), pubkey)).not.toThrow();
  });

  it("reads the key ID as minisign prints it", () => {
    const { pubkey } = minisignKey([0xdb, 0x25, 0xfc, 0x75, 0x2e, 0xd5, 0xf3, 0x7e]);
    expect(parsePublicKey(pubkey).keyId).toBe("7EF3D52E75FC25DB");
  });

  it("rejects a changed file", () => {
    const { pubkey, signFile } = minisignKey();
    expect(() => verifySignature(Buffer.from("other bytes"), signFile(data), pubkey)).toThrow(
      "Bad signature for this file",
    );
  });

  it("rejects another key's signature", () => {
    const ours = minisignKey();
    const theirs = minisignKey([9, 9, 9, 9, 9, 9, 9, 9]);
    expect(() => verifySignature(data, theirs.signFile(data), ours.pubkey)).toThrow(
      "Signed with key",
    );
  });

  it("rejects another key with the same key ID", () => {
    const ours = minisignKey();
    const impostor = minisignKey();
    expect(() => verifySignature(data, impostor.signFile(data), ours.pubkey)).toThrow(
      "Bad signature for this file",
    );
  });

  it("rejects an edited trusted comment", () => {
    const { pubkey, signFile } = minisignKey();
    const lines = Buffer.from(signFile(data), "base64").toString().split("\n");
    lines[2] = "trusted comment: timestamp:2\tfile:other.exe";
    expect(() => verifySignature(data, b64(lines.join("\n")), pubkey)).toThrow("trusted comment");
  });

  it("rejects text that isn't a signature", () => {
    const { pubkey } = minisignKey();
    expect(() => verifySignature(data, b64("hello"), pubkey)).toThrow("Not a minisign signature");
  });
});
