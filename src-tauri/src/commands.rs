//! All `#[tauri::command]`s. TS bindings are generated into
//! `src/shared/bindings.ts` on debug runs; call them via `src/shared/ipc.ts`.

use tauri::AppHandle;

use crate::frames::CaptureId;
use crate::session::{self, OverlayReport};

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

/// Esc / right-click on an overlay.
#[tauri::command]
#[specta::specta]
pub fn cancel_capture(app: AppHandle, capture_id: CaptureId) {
    session::cancel(&app, capture_id);
}
