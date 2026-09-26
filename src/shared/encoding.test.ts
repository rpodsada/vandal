/// <reference types="node" />
// Guards against UTF-8 text that was read as Windows-1252 and saved again
// (e.g. U+00D7 "multiplication sign" turning into U+00C3 U+2014), which
// Windows PowerShell 5.1 Get-Content/Set-Content edits can cause.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src", "src-tauri/src"];
const EXTENSIONS = /\.(ts|tsx|css|html|rs)$/;
// Lead bytes of common UTF-8 sequences, misread as Windows-1252. Built from
// char codes so this file stays ASCII and does not match itself.
const c = (...codes: number[]) => String.fromCharCode(...codes);
const MOJIBAKE = new RegExp(
  `${c(0xc3)}[${c(0x80)}-${c(0xbf)}${c(0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026)}]` +
    `|${c(0xe2, 0x20ac)}|${c(0xc2)}[${c(0xa0)}-${c(0xbf)}]`,
);

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (EXTENSIONS.test(name)) yield path;
  }
}

describe("source encoding", () => {
  it("has no mojibake", () => {
    const bad = ROOTS.flatMap((root) => [...files(root)]).filter((f) =>
      MOJIBAKE.test(readFileSync(f, "utf8")),
    );
    expect(bad).toEqual([]);
  });
});
