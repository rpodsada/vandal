//! All `#[tauri::command]`s. TS bindings are generated into
//! `src/shared/bindings.ts` on debug runs; call them via `src/shared/ipc.ts`.

use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::editor::{self, EditorInit};
use crate::frames::CaptureId;
use crate::output;
use crate::session::{self, CaptureTarget, OverlayLoad, OverlayReport};
use crate::settings::{self, Settings};
use crate::state::AppState;

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

// ---------- editor ----------

/// Editor page mounted: what it shows. `None` if the editor is already gone.
#[tauri::command]
#[specta::specta]
pub fn editor_init(app: AppHandle, window: WebviewWindow) -> Option<EditorInit> {
    editor::init(&app, window.label())
}

/// Editor page painted its image; show the window.
#[tauri::command]
#[specta::specta]
pub fn editor_ready(app: AppHandle, window: WebviewWindow) {
    editor::ready(&app, &window);
}

// ---------- settings window ----------

#[tauri::command]
#[specta::specta]
pub fn get_settings(app: AppHandle) -> Settings {
    app.state::<AppState>().settings.read().unwrap().clone()
}

/// Validate, save and apply. Returns the settings as stored (values may be
/// normalized), or a message to show the user.
#[tauri::command]
#[specta::specta]
pub fn update_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    settings::update(&app, settings)
}

/// Folder picker, modal to the calling window. Paths under the user profile
/// come back as `%USERPROFILE%\...`.
#[tauri::command]
#[specta::specta]
pub async fn pick_folder(window: WebviewWindow, current: String) -> Option<String> {
    let start = output::resolve_dir(&current);
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = window
            .dialog()
            .file()
            .set_title("Choose a folder")
            .set_parent(&window);
        if start.is_dir() {
            dialog = dialog.set_directory(&start);
        }
        dialog.blocking_pick_folder()
    })
    .await
    .ok()
    .flatten()?;
    let path = picked.into_path().ok()?;
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    Some(output::contract_env(
        &path.to_string_lossy(),
        "USERPROFILE",
        &home,
    ))
}

/// What a file saved now with this template would be called.
#[tauri::command]
#[specta::specta]
pub fn preview_filename(template: String) -> String {
    format!(
        "{}.png",
        output::render_template(&template, &output::Timestamp::now_local())
    )
}

/// Open a (settings-style, may contain `%VARS%`) folder in Explorer,
/// creating it first so the button always does something.
#[tauri::command]
#[specta::specta]
pub fn open_folder(path: String) -> Result<(), String> {
    let dir = output::resolve_dir(&path);
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    std::process::Command::new("explorer.exe")
        .arg(&dir)
        .spawn()
        .map(drop)
        .map_err(|e| e.to_string())
}
