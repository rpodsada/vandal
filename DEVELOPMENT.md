# Developing Vandal

Vandal is a Tauri 2 app: a Rust core (`src-tauri/`) for capture, hotkeys, the tray, settings
and image output, and a React + TypeScript UI (`src/`, built with Vite) for the overlay,
editor and Settings windows.

[`CLAUDE.md`](CLAUDE.md) has the working conventions (commands, IPC, settings, checks).

## Prerequisites

- Windows 10 1903+ or Windows 11, x64. Build and run natively, not in WSL: capture, overlays and
  hotkeys need the real desktop.
- Rust stable (`x86_64-pc-windows-msvc`) and Visual Studio Build Tools with the "Desktop
  development with C++" workload.
- Node LTS and npm. Run Node tooling from PowerShell. On this machine, Git Bash puts an old
  Node 16 first on PATH.
- Ideally two monitors with different scaling, one to the left of or above the primary, so
  negative coordinates get exercised.

## Run

```powershell
npm install
npm run tauri:dev
```

The dev build has its own identity (`Vandal Dev`, `com.vandal.desktop.dev`) and Ctrl-prefixed
shortcuts (`Ctrl+Win+F12` region, `Ctrl+Win+Shift+F12` full screen), so it runs alongside an
installed copy. Its settings live in `%APPDATA%\com.vandal.desktop.dev\`.

## Checks

Run all of these before calling a change done:

```powershell
cd src-tauri; cargo fmt; cargo clippy --all-targets -- -D warnings; cargo test; cd ..
npm run lint; npm test; npx tsc --noEmit
npm run ext:build   # if extension/ changed: type-checks and builds the browser extension
```

## Browser extension

`extension/chrome/` is Vandal for Chrome, a Manifest V3 extension that also runs in Edge. It
shares the root's tooling: `npm run lint` and `npm test` cover it, and it uses Vandal's theme
tokens from `src/shared/theme.css`.

```powershell
npm run ext:build   # builds extension/chrome/dist
npm run ext:dev     # rebuilds on every change
```

To load it, open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, click
**Load unpacked** and pick `extension/chrome/dist`. After a rebuild, click the extension's reload
button there and reopen the popup. The manifest's `key` keeps the extension ID the same
everywhere (`bmloooliddgohojbpadiljacckgdbngm`); Vandal's native messaging host will only accept
that ID.

## Build an installer

```powershell
npm run build:local
```

This builds a release installer with a build number. It lands in
`src-tauri/target/release/bundle/nsis/`, for example `Vandal_0.3.0-beta.3+5_x64-setup.exe`.
Settings › About shows the same version and the commit it was built from, for example
`0.3.0-beta.3+5 (2cf53f9)`. For just the release exe (`src-tauri/target/release/vandal.exe`),
without an installer, use `npm run build:local -- --no-bundle`. Other arguments are passed on to
`tauri build` too.

How the build number works:

- **`+5` is the number of commits since the last release tag** (`v0.3.0-beta.3`), taken from
  `git describe`. Every new commit gives the next build a higher number. Nothing in the repo
  changes, so there's nothing to commit.
- **Build exactly on a tag and you get the plain version** (`0.3.0-beta.3`), the same as the
  CI release.
- **Uncommitted changes** don't change the number, but About adds "modified" and the script
  warns. Commit first if you want the build to be traceable.
- **Build after `release:bump` but before tagging** and you get the new version without a build
  number. That build is the release candidate.
- **Semver ignores everything after `+`.** The updater treats `0.3.0-beta.3+5` as
  `0.3.0-beta.3`, so it still offers `beta.4`, and it never "updates" you back to `beta.3`.
- **The build number must be digits only.** Windows file versions are numeric, so NSIS writes
  the number into the exe's file version (`0.3.0.5`) and would replace anything else with `0`.

Build-numbered installers are for your own machine. A build that goes to anyone else should be
a release (below), so it has a tag and release notes.

`npm run tauri build` still works. It builds the version in `package.json` with no build number,
like CI does.

## Releasing

`package.json` holds the version, which `tauri.conf.json` reads. `src-tauri/Cargo.toml` and
both lockfiles must match it. Versions follow semver and stay at 0.x for now. Builds for
testers are prereleases of the next version (`0.3.0-beta.1`, `0.3.0-beta.2`...), which sort
before the release itself (`0.3.0`). Every release must have a new, higher number:

- **Tester build during a phase:** the next beta (`0.3.0-beta.4`).
- **Phase done:** the final version (`0.3.0`). Each phase raises the minor version, and the
  going-public release is `1.0.0`.
- **Fix to a final release:** the next patch (`0.3.1`). Don't use a patch number for in-between
  builds: `0.3.1` sorts after `0.3.0`, so it would claim the phase is done and outrank every
  later beta. Local builds get a build number instead (see Build an installer).
- **After 1.0:** major if something users rely on breaks (settings that can't migrate, a
  feature removed, a Windows version dropped), minor for new features, patch for fixes only.
- **Never reuse a version, or move or delete a published tag.** If a published release is
  broken, release the next number. A tag whose release is still a draft can be moved (below).
- **Keep the dot in `beta.10`.** It then sorts as a number, after `beta.9`. Without the dot,
  `beta10` sorts as text, before `beta9`.

1. As you work, add changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. Bump the version:

   ```powershell
   npm run release:bump -- 0.3.0-beta.2
   ```

   This sets the version in all four files. It also turns `[Unreleased]` into a dated
   `[0.3.0-beta.2]` section and updates the compare links. It refuses a version that isn't
   higher than the current one (the updater only offers higher versions), and it refuses an
   empty `[Unreleased]`.

3. Commit, tag and push. The bump prints the exact commands:

   ```powershell
   git commit -am "Release v0.3.0-beta.2"
   git tag -a v0.3.0-beta.2 -m "Vandal 0.3.0-beta.2"
   git push origin main v0.3.0-beta.2
   ```

4. The tag starts the **Release** workflow (`.github/workflows/release.yml`). It checks that the
   tag matches the version files and has CHANGELOG notes, and runs the full checks. Then it
   builds the installer, attests its build provenance (signed by GitHub, checked with
   `gh attestation verify`), and creates a **draft** release with the installer,
   `SHA256SUMS.txt` and that version's CHANGELOG section. Tags with a `-` are marked as
   prereleases.
5. Download the installer from the draft, install it over the previous version and smoke-test
   it. Check `gh attestation verify <installer> --repo rpodsada/vandal` passes and that its
   SHA-256 (`Get-FileHash`) matches the draft's `SHA256SUMS.txt`, and put
   it on the website's download dialog, which is hosted apart from GitHub, so a swapped
   installer can't come with a matching hash. Then press **Publish release** on GitHub.

If the workflow fails, fix the problem on `main`, then move the tag and push it again:
`git tag -f -a v… -m "…"` and `git push -f origin v…`. A re-run replaces the files on an
existing draft.

To test the pipeline without releasing, run the workflow by hand (**Actions › Release › Run
workflow**). It runs the same checks and build, and keeps the installer as a workflow artifact
for 14 days.
