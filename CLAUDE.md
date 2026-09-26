# capture-app

Tray-resident Windows screen capture + markup tool. Tauri 2 (Rust) + React/TS (Vite).
**Read `docs/PLAN.md` before starting work.** Work only on the current phase unless asked.

## Non-negotiables (PLAN §1)
- Capture pixels *before* showing/focusing anything when the hotkey fires.
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
- Small, focused commits that explain *why*.

## Before calling a task done
```
cd src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test
npm run lint && npm test && npx tsc --noEmit
npm run tauri dev   # smoke run
```
Run Node tooling from PowerShell. Git Bash on this machine has an old nvm Node 16 first on PATH.

## Handy
- Hotkey (Phase 0): `Ctrl+Shift+F12`. Esc / right-click cancels.
- Benchmark + pixel-alignment check: `npm run tauri build -- --no-bundle`, then
  `CAPTURE_BENCH=10 src-tauri/target/release/capture-app.exe`. Record results in `docs/perf.md`.
- `CAPTURE_TRANSFER=bmp` switches the overlay transfer format.
- Rust unit tests must stay on pure modules. Test binaries that link the Tauri runtime crash on
  Windows (see the PLAN decisions log).
