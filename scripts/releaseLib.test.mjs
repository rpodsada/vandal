import { describe, expect, it } from "vitest";
import {
  cargoTomlVersion,
  compareVersions,
  releaseNotes,
  setCargoLockVersion,
  setCargoTomlVersion,
  setPackageJsonVersion,
  stampChangelog,
  versionFromTag,
} from "./releaseLib.mjs";

describe("compareVersions", () => {
  it("orders by semver, prereleases before the release", () => {
    const sorted = [
      "0.3.0",
      "0.2.0",
      "0.3.0-beta.10",
      "0.3.0-beta.2",
      "0.3.0-alpha.1",
      "0.3.0-beta",
      "0.10.0",
      "0.3.1",
    ].sort(compareVersions);
    expect(sorted).toEqual([
      "0.2.0",
      "0.3.0-alpha.1",
      "0.3.0-beta",
      "0.3.0-beta.2",
      "0.3.0-beta.10",
      "0.3.0",
      "0.3.1",
      "0.10.0",
    ]);
  });

  it("treats equal versions as equal", () => {
    expect(compareVersions("0.3.0-beta.1", "0.3.0-beta.1")).toBe(0);
  });

  it("rejects things that aren't versions", () => {
    expect(() => compareVersions("0.3", "0.3.0")).toThrow();
    expect(() => compareVersions("0.3.0+build", "0.3.0")).toThrow();
  });
});

describe("versionFromTag", () => {
  it("reads v-prefixed tags and refs", () => {
    expect(versionFromTag("v0.3.0-beta.1")).toBe("0.3.0-beta.1");
    expect(versionFromTag("refs/tags/v1.0.0")).toBe("1.0.0");
  });

  it("refuses other tags", () => {
    expect(versionFromTag("0.3.0")).toBeNull();
    expect(versionFromTag("vnext")).toBeNull();
  });
});

describe("version files", () => {
  const toml = [
    "[package]",
    'name = "vandal"',
    'authors = ["Richard Podsada"]',
    'version = "0.2.0"',
    "",
    "[dependencies]",
    'serde = { version = "1" }',
    "",
  ].join("\n");

  it("edits only the [package] version in Cargo.toml", () => {
    expect(cargoTomlVersion(toml)).toBe("0.2.0");
    const out = setCargoTomlVersion(toml, "0.3.0-beta.1");
    expect(cargoTomlVersion(out)).toBe("0.3.0-beta.1");
    expect(out).toContain('serde = { version = "1" }');
  });

  it("edits only our crate in Cargo.lock, with either line ending", () => {
    const lock =
      '[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\r\nname = "vandal"\r\nversion = "0.2.0"\r\n';
    const out = setCargoLockVersion(lock, "vandal", "0.3.0");
    expect(out).toContain('name = "vandal"\r\nversion = "0.3.0"');
    expect(out).toContain('name = "serde"\nversion = "1.0.0"');
    expect(() => setCargoLockVersion(lock, "missing", "1.0.0")).toThrow();
  });

  it("sets both versions in package-lock.json", () => {
    const lock = JSON.stringify({
      name: "vandal",
      version: "0.2.0",
      packages: { "": { version: "0.2.0" } },
    });
    const out = JSON.parse(setPackageJsonVersion(lock, "0.3.0"));
    expect(out.version).toBe("0.3.0");
    expect(out.packages[""].version).toBe("0.3.0");
  });
});

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Something new.

## [0.2.0] - 2026-09-27

### Added

- Quick edit.

[Unreleased]: https://github.com/o/r/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/o/r/releases/tag/v0.2.0
`;

describe("releaseNotes", () => {
  it("returns a section's body, without the link definitions", () => {
    expect(releaseNotes(CHANGELOG, "0.2.0")).toBe("### Added\n\n- Quick edit.");
  });

  it("returns null for a missing or empty section", () => {
    expect(releaseNotes(CHANGELOG, "9.9.9")).toBeNull();
    expect(releaseNotes("## [1.0.0] - 2026-01-01\n\n## [0.9.0]\n\n- x\n", "1.0.0")).toBeNull();
  });
});

describe("stampChangelog", () => {
  const stamp = (text, version = "0.3.0") =>
    stampChangelog(text, {
      version,
      previous: "0.2.0",
      date: "2026-10-01",
      repoUrl: "https://github.com/o/r",
    });

  it("dates [Unreleased] and starts a new one", () => {
    const out = stamp(CHANGELOG);
    expect(out).toContain(
      "## [Unreleased]\n\n## [0.3.0] - 2026-10-01\n\n### Added\n\n- Something new.",
    );
    expect(releaseNotes(out, "0.3.0")).toBe("### Added\n\n- Something new.");
    expect(out).toContain(
      "[Unreleased]: https://github.com/o/r/compare/v0.3.0...HEAD\n[0.3.0]: https://github.com/o/r/compare/v0.2.0...v0.3.0\n[0.2.0]:",
    );
  });

  it("keeps CRLF files CRLF", () => {
    const out = stamp(CHANGELOG.replace(/\n/g, "\r\n"));
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it("refuses a version that already has a section", () => {
    expect(() => stamp(CHANGELOG, "0.2.0")).toThrow(/already/);
  });
});
