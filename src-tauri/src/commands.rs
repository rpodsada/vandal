//! All `#[tauri::command]`s. TS bindings are generated into
//! `src/shared/bindings.ts` on debug runs; call them via `src/shared/ipc.ts`.

use tauri::AppHandle;

use crate::frames::CaptureId;
use crate::session::{self, CaptureTarget, OverlayLoad, OverlayReport};

/// Overlay page mounted; returns its frame if a capture is waiting on it.
#[tauri::command]
#[specta::specta]
pub fn overlay_pending_load(app: AppHandle, monitor_index: u32) -> Option<OverlayLoad> {
    session::pending_load(&app, monitor_index)
}

/// Overlay finished drawing its frame.
#[tauri::command]
#[specta::specta]
pub fn overlay_ready(app: AppHandle, capture_id: CaptureId, report: OverlayReport) {
    session::overlay_ready(&app, capture_id, report);
}

/// Overlay has painted at least one frame since being shown.
#[tauri::command]
#[specta::specta]
pub fn overlay_visible(app: AppHandle, capture_id: CaptureId, monitor_index: u32) {
    session::overlay_visible(&app, capture_id, monitor_index);
}

/// The user started selecting on this monitor; other overlays clear theirs.
#[tauri::command]
#[specta::specta]
pub fn selection_started(app: AppHandle, capture_id: CaptureId, monitor_index: u32) {
    session::selection_started(&app, capture_id, monitor_index);
}

/// Confirm: crop and run the after-capture actions.
#[tauri::command]
#[specta::specta]
pub fn commit_selection(app: AppHandle, capture_id: CaptureId, target: CaptureTarget) {
    session::commit(&app, capture_id, target);
}

/// Esc / right-click on an overlay.
#[tauri::command]
#[specta::specta]
pub fn cancel_capture(app: AppHandle, capture_id: CaptureId) {
    session::cancel(&app, capture_id);
}
