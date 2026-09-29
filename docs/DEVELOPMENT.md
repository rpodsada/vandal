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

## Versions and releases

`package.json` holds the version, which `tauri.conf.json` reads. Keep `src-tauri/Cargo.toml`
in step. See PLAN "Versioning" for the numbering (including `-beta.N` prereleases). Add each
release's notes to [`../CHANGELOG.md`](../CHANGELOG.md) and tag it `vX.Y.Z`. The release
pipeline is planned in PLAN Phase 3C.
