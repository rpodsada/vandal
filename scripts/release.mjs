// Release helper (PLAN 3C.2). Run from the repo root:
//
//   node scripts/release.mjs bump <version>   set the version everywhere and date the CHANGELOG
//   node scripts/release.mjs check <tag>      CI: the tag matches the version files and has notes
//   node scripts/release.mjs notes <tag>      print that version's CHANGELOG section

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import {
  cargoTomlVersion,
  compareVersions,
  parseVersion,
  releaseNotes,
  setCargoLockVersion,
  setCargoTomlVersion,
  setPackageJsonVersion,
  stampChangelog,
  versionFromTag,
} from "./releaseLib.mjs";

const FILES = {
  pkg: "package.json",
  lock: "package-lock.json",
  cargo: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
  changelog: "CHANGELOG.md",
};

const read = (path) => readFileSync(path, "utf8");

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function repoUrl(pkg) {
  const m = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(pkg.repository ?? "");
  if (!m) fail(`package.json "repository" should be "github:owner/repo"`);
  return `https://github.com/${m[1]}`;
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function bump(version) {
  if (!version || !parseVersion(version))
    fail(`"${version ?? ""}" is not a version like 0.3.0-beta.2`);
  const pkg = JSON.parse(read(FILES.pkg));
  const previous = pkg.version;
  // The updater only offers higher versions (PLAN Versioning).
  if (compareVersions(version, previous) <= 0) fail(`${version} must be higher than ${previous}`);
  const changelog = stampChangelog(read(FILES.changelog), {
    version,
    previous,
    date: today(),
    repoUrl: repoUrl(pkg),
  });
  if (!releaseNotes(changelog, version)) {
    fail(`CHANGELOG [Unreleased] is empty: add the notes for ${version} first`);
  }

  writeFileSync(FILES.pkg, setPackageJsonVersion(read(FILES.pkg), version));
  writeFileSync(FILES.lock, setPackageJsonVersion(read(FILES.lock), version));
  writeFileSync(FILES.cargo, setCargoTomlVersion(read(FILES.cargo), version));
  writeFileSync(FILES.cargoLock, setCargoLockVersion(read(FILES.cargoLock), pkg.name, version));
  writeFileSync(FILES.changelog, changelog);

  console.log(`Version ${previous} -> ${version}. Next:`);
  console.log(`  git commit -am "Release v${version}"`);
  console.log(`  git tag -a v${version} -m "Vandal ${version}"`);
  console.log(`  git push origin main v${version}`);
}

function check(tag) {
  const version = versionFromTag(tag ?? "");
  if (!version) fail(`"${tag ?? ""}" is not a version tag like v0.3.0-beta.1`);
  const found = {
    [FILES.pkg]: JSON.parse(read(FILES.pkg)).version,
    [FILES.lock]: JSON.parse(read(FILES.lock)).version,
    [FILES.cargo]: cargoTomlVersion(read(FILES.cargo)),
  };
  const wrong = Object.entries(found).filter(([, v]) => v !== version);
  for (const [file, v] of wrong)
    console.error(`release: ${file} has ${v}, the tag says ${version}`);
  if (wrong.length) fail("run `npm run release:bump` before tagging");
  if (!releaseNotes(read(FILES.changelog), version)) fail(`CHANGELOG has no notes for ${version}`);
  console.log(`${tag}: versions match and the CHANGELOG has notes.`);
}

function notes(tagOrVersion) {
  const version = versionFromTag(tagOrVersion ?? "") ?? tagOrVersion;
  const body = releaseNotes(read(FILES.changelog), version ?? "");
  if (!body) fail(`CHANGELOG has no notes for ${version}`);
  process.stdout.write(body + "\n");
}

const [command, arg] = process.argv.slice(2);
if (command === "bump") bump(arg);
else if (command === "check") check(arg);
else if (command === "notes") notes(arg);
else fail("usage: release.mjs bump <version> | check <tag> | notes <tag>");
