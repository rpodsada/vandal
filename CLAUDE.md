# Vandal

Tray-resident Windows screen capture + markup tool. Tauri 2 (Rust) + React/TS (Vite).
**Read `docs/PLAN.md` before starting work** (its Status section says where we are). Work only on the
current phase unless asked. Current phase: **3 (polish, testing with friends)**, starting with 3A
theming. Plan each sub-phase with Richard first, then build one feature per increment, confirmed by
Richard and committed before the next one. Warn Richard before changes that restart the dev app
(Rust, `Cargo.toml`, `tauri.conf.json`): he is often using it.

## Non-negotiables (PLAN §1)

- Capture pixels _before_ showing/focusing anything when the hotkey fires.
- Rust owns the pixels. No image data over JSON IPC; the webview fetches frames from the
  `capture://` protocol (`http://capture.localhost/frame/{id}/{monitor}`).
- Physical pixels in virtual-desktop coordinates (can be negative) are the source of truth.
  CSS conversion happens only at the display edge, per monitor (`geometry.rs` / `geometry.ts`).
- Capture/window enumeration/OCR sit behind traits (`capture::Capturer`).

## Conventions

- All Tauri commands go in `src-tauri/src/commands.rs` with `#[specta::specta]`. TS bindings
  are generated into `src/shared/bindings.ts` on every debug run (commit it). Frontend calls go
  through `src/shared/ipc.ts`, never raw `invoke` strings.
- Tauri capabilities are minimal and per-window. Overlays get no filesystem access.
- New dependencies need a short justification in the commit message.
- If the plan turns out to be wrong, update `docs/PLAN.md` in the same commit and add to its
  Decisions log.
- Small, focused commits that explain _why_.

## Before calling a task done

```
cd src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test
npm run lint && npm test && npx tsc --noEmit
npm run tauri:dev   # smoke run (dev identity; coexists with an installed copy)
```

Never edit source files with Windows PowerShell `Get-Content`/`Set-Content`: 5.1 reads UTF-8 as
Windows-1252 and corrupts non-ASCII text (`src/shared/encoding.test.ts` catches this).

Run Node tooling from PowerShell. Git Bash on this machine has an old nvm Node 16 first on PATH.

## Settings

- Rust (`settings.rs`) is the source of truth; every change goes through `settings::update`
  (validate, save, apply live, broadcast `SettingsChanged`).
- To add a setting: add the field (with a default) to the Rust struct, then add an item to
  `src/settings/sections.tsx`. New control kind: extend `Item` in `schema.ts` and register a
  component in `controls/index.ts`.
- If applying a setting needs side effects (re-register, rebuild a menu...), add them to
  `settings::update`.

## Handy

- Hotkeys (defaults): `Win+F12` region, `Win+Shift+F12` full screen. Overlay keys: Enter/double-click
  confirm, F this screen, A all screens, arrows nudge, Ctrl+arrows resize from the bottom-right (Shift = 10px),
  Esc/right-click cancel.
- Settings files: `%APPDATA%\com.vandal.desktop\settings.json` (installed) and
  `%APPDATA%\com.vandal.desktop.dev\` (dev builds). `vandal --settings` opens Settings.
- Dev builds use Ctrl-prefixed hotkeys (`Ctrl+Win+F12`...) so they don't clash with an installed copy.
- Synthetic-input testing from PowerShell: pass coordinates as `[int]` params. A bare `-100`
  command argument is a _string_, and `"-100" + 10` concatenates. Send arrow keys with
  `KEYEVENTF_EXTENDEDKEY`, or Windows treats them as numpad keys and drops Shift.
  Pass real scan codes too (e.g. `keybd_event(0x57, 0x11, ...)` for W): with scan code 0 the
  webview sees an empty `KeyboardEvent.code`, and our shortcuts match on `code`.
- Benchmark + pixel-alignment check: `npm run tauri build -- --no-bundle`, then
  `CAPTURE_BENCH=10 src-tauri/target/release/vandal.exe`. Record results in `docs/perf.md`.
- `CAPTURE_TRANSFER=bmp` switches the overlay transfer format.
- Releasing: `npm run release:bump -- <version>`, then tag `v<version>` and push. CI builds a draft
  GitHub release (steps in `docs/DEVELOPMENT.md` › Releasing). Add changes under `[Unreleased]`
  in `CHANGELOG.md` as you go.
- Rust unit tests must stay on pure modules. Test binaries that link the Tauri runtime crash on
  Windows (see the PLAN decisions log).
