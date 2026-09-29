# Developing Vandal

Vandal is a Tauri 2 app: a Rust core (`src-tauri/`) for capture, hotkeys, the tray, settings
and image output, and a React + TypeScript UI (`src/`, built with Vite) for the overlay,
editor and Settings windows.

- [`PLAN.md`](PLAN.md): the architecture, the phases and where things stand (its Status
  section), plus the Decisions log.
- [`../CLAUDE.md`](../CLAUDE.md): the working conventions (commands, IPC, settings, checks).
- [`test-matrix.md`](test-matrix.md): the manual checks run at the end of each phase.
- [`perf.md`](perf.md): capture benchmarks.

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
```

## Build an installer

```powershell
npm run tauri build
```

The NSIS installer lands in `src-tauri/target/release/bundle/nsis/`. For a quick release exe
without an installer, use `npm run tauri build -- --no-bundle`.

## Releasing

`package.json` holds the version, which `tauri.conf.json` reads. `src-tauri/Cargo.toml` and
both lockfiles must match it. See PLAN "Versioning" for the numbering (including `-beta.N`
prereleases).

1. As you work, add changes under `## [Unreleased]` in [`../CHANGELOG.md`](../CHANGELOG.md).
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
   builds the installer and creates a **draft** release with the installer, `SHA256SUMS.txt`
   and that version's CHANGELOG section. Tags with a `-` are marked as prereleases.
5. Download the installer from the draft, install it over the previous version and smoke-test
   it. Then press **Publish release** on GitHub.

If the workflow fails, fix the problem on `main`, then move the tag and push it again:
`git tag -f -a v… -m "…"` and `git push -f origin v…`. A re-run replaces the files on an
existing draft.

To test the pipeline without releasing, run the workflow by hand (**Actions › Release › Run
workflow**). It runs the same checks and build, and keeps the installer as a workflow artifact
for 14 days.
