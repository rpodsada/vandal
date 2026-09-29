// Pure helpers for scripts/release.mjs (PLAN 3C.2). No file or process access
// here, so everything is unit-tested (releaseLib.test.mjs).

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** Parses "1.2.3" / "1.2.3-beta.1" (no build metadata); null if invalid. */
export function parseVersion(text) {
  const m = SEMVER.exec(text);
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split(".") : [],
  };
}

/** Semver precedence: negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`Not a version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  }
  // A release outranks its prereleases (0.3.0-beta.2 < 0.3.0).
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn && Number(p) !== Number(q)) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    if (!pn && p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/** "v0.3.0-beta.1" -> "0.3.0-beta.1"; null if the tag isn't a version tag. */
export function versionFromTag(tag) {
  const m = /^(?:refs\/tags\/)?v(.+)$/.exec(tag);
  return m && parseVersion(m[1]) ? m[1] : null;
}

const TOML_VERSION = /^(version\s*=\s*")([^"]+)(".*)$/;

/** Index of the `version = "..."` line in Cargo.toml's [package] section. */
function cargoVersionLine(lines) {
  let inPackage = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("[")) inPackage = line === "[package]";
    else if (inPackage && TOML_VERSION.test(line)) return i;
  }
  throw new Error("No version in Cargo.toml [package]");
}

/** The `version` in Cargo.toml's [package] section. */
export function cargoTomlVersion(toml) {
  const lines = toml.split("\n");
  return TOML_VERSION.exec(lines[cargoVersionLine(lines)].trim())[2];
}

export function setCargoTomlVersion(toml, version) {
  const lines = toml.split("\n");
  const i = cargoVersionLine(lines);
  lines[i] = lines[i].replace(/(version\s*=\s*")[^"]+(")/, `$1${version}$2`);
  return lines.join("\n");
}

/** Our crate's entry in Cargo.lock. */
export function setCargoLockVersion(lock, name, version) {
  const re = new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${name}"\\r?\\nversion = ")[^"]+(")`);
  if (!re.test(lock)) throw new Error(`No ${name} package in Cargo.lock`);
  return lock.replace(re, `$1${version}$2`);
}

/** package.json or package-lock.json text, as npm formats it. */
export function setPackageJsonVersion(text, version) {
  const json = JSON.parse(text);
  json.version = version;
  if (json.packages?.[""]) json.packages[""].version = version;
  return JSON.stringify(json, null, 2) + "\n";
}

const HEADING = /^## \[([^\]]+)\].*$/gm;

/** The body of a version's CHANGELOG section, trimmed; null if it has none. */
export function releaseNotes(changelog, version) {
  const text = changelog.replace(/\r\n/g, "\n");
  const headings = [...text.matchAll(HEADING)];
  const i = headings.findIndex((h) => h[1] === version);
  if (i < 0) return null;
  const start = headings[i].index + headings[i][0].length;
  const next = headings[i + 1];
  const linkDefs = text.search(/^\[[^\]]+\]: /m);
  const end = next ? next.index : linkDefs >= 0 ? linkDefs : text.length;
  const body = text.slice(start, end).trim();
  return body || null;
}

/**
 * Turns [Unreleased] into a dated section for `version`, starts a new empty
 * [Unreleased], and updates the compare links at the bottom.
 */
export function stampChangelog(changelog, { version, previous, date, repoUrl }) {
  const eol = changelog.includes("\r\n") ? "\r\n" : "\n";
  let text = changelog.replace(/\r\n/g, "\n");
  if (!/^## \[Unreleased\][ \t]*$/m.test(text))
    throw new Error("CHANGELOG has no [Unreleased] section");
  if (new RegExp(`^## \\[${escape(version)}\\]`, "m").test(text)) {
    throw new Error(`CHANGELOG already has a ${version} section`);
  }
  text = text.replace(/^## \[Unreleased\][ \t]*$/m, `## [Unreleased]\n\n## [${version}] - ${date}`);
  const unreleased = `[Unreleased]: ${repoUrl}/compare/v${version}...HEAD`;
  const added = `[${version}]: ${repoUrl}/compare/v${previous}...v${version}`;
  if (/^\[Unreleased\]: .*$/m.test(text)) {
    text = text.replace(/^\[Unreleased\]: .*$/m, `${unreleased}\n${added}`);
  } else {
    text = `${text.trimEnd()}\n\n${unreleased}\n${added}\n`;
  }
  return text.replace(/\n/g, eol);
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
