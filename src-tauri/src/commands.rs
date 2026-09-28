//! All `#[tauri::command]`s. TS bindings are generated into
//! `src/shared/bindings.ts` on debug runs; call them via `src/shared/ipc.ts`.

use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::editor::{self, CloseChoice, EditorInit, ExportAction, ExportOutcome};
use crate::frames::CaptureId;
use crate::geometry::PhysicalRect;
use crate::output;
use crate::session::{
    self, CaptureTarget, OverlayLoad, OverlayReport, QuickAction, QuickMarkup, QuickOutcome,
};
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

/// Quick edit's Copy / Save on the selection; may close quick edit.
#[tauri::command]
#[specta::specta]
pub async fn quick_output(
    app: AppHandle,
    capture_id: CaptureId,
    rect: PhysicalRect,
    action: QuickAction,
    markup: QuickMarkup,
) -> Result<QuickOutcome, String> {
    session::quick_output(&app, capture_id, rect, action, markup)
}

/// Quick edit's Done (Enter): deliver the selection with its markup.
#[tauri::command]
#[specta::specta]
pub async fn quick_done(
    app: AppHandle,
    capture_id: CaptureId,
    rect: PhysicalRect,
    markup: QuickMarkup,
) -> Result<(), String> {
    session::quick_done(&app, capture_id, rect, markup)
}

/// The Windows accent color, for the accent setting's "Windows" choice.
#[tauri::command]
#[specta::specta]
pub fn windows_accent() -> Option<crate::appearance::WindowsAccent> {
    crate::appearance::windows_accent()
}

/// Quick edit's "Open in editor": hand the selection and its annotations (a
/// JSON array in virtual-desktop px) to a new editor window.
#[tauri::command]
#[specta::specta]
pub fn quick_open_editor(
    app: AppHandle,
    capture_id: CaptureId,
    rect: PhysicalRect,
    annotations: String,
) -> Result<(), String> {
    session::quick_open_editor(&app, capture_id, rect, annotations)
}

/// Quick edit: this overlay's selection now has markup (or no longer has).
#[tauri::command]
#[specta::specta]
pub fn quick_markup_changed(app: AppHandle, capture_id: CaptureId, monitor_index: u32, has: bool) {
    session::markup_changed(&app, capture_id, monitor_index, has);
}

/// Quick edit: bring the overlay with the markup back to the front.
#[tauri::command]
#[specta::specta]
pub fn quick_focus_overlay(app: AppHandle, monitor_index: u32) {
    session::focus_overlay(&app, monitor_index);
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

/// Copy or save `crop` of the base image. With `withHighlights`, the layer
/// POSTed to `highlightsUrl` just before is multiplied in; with `withLayer`, the
/// annotation layer POSTed to `layerUrl` is composited on top. `layerMs`
/// (render + upload time in the page) is only for the perf log.
#[tauri::command]
#[specta::specta]
pub async fn editor_export(
    app: AppHandle,
    window: WebviewWindow,
    crop: PhysicalRect,
    with_layer: bool,
    with_highlights: bool,
    action: ExportAction,
    layer_ms: Option<f64>,
) -> Result<ExportOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        editor::export(
            &app,
            &window,
            crop,
            with_layer,
            with_highlights,
            action,
            layer_ms,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Ask whether to save unsaved changes before the editor closes.
#[tauri::command]
#[specta::specta]
pub async fn editor_confirm_close(app: AppHandle, window: WebviewWindow) -> CloseChoice {
    tauri::async_runtime::spawn_blocking(move || editor::confirm_close(&app, &window))
        .await
        .unwrap_or(CloseChoice::Cancel)
}

/// Start a new region capture from the editor.
#[tauri::command]
#[specta::specta]
pub fn editor_new_capture(app: AppHandle, window: WebviewWindow) {
    editor::new_capture(&app, &window);
}

/// Ctrl+O / "Open": pick image files, each opening in a new editor.
#[tauri::command]
#[specta::specta]
pub async fn editor_open_image(app: AppHandle, window: WebviewWindow) {
    editor::ask_open(&app, Some(&window));
}

/// Show a file selected in Explorer.
#[tauri::command]
#[specta::specta]
pub fn reveal_file(path: String) {
    output::reveal_in_explorer(std::path::Path::new(&path));
}

// ---------- settings window ----------

#[tauri::command]
#[specta::specta]
pub fn get_settings(app: AppHandle) -> Settings {
    app.state::<AppState>().settings.read().unwrap().clone()
}

/// Add a color to the presets the given tool uses (the custom color picker's
/// "Save as preset"). Returns a message to show if it can't.
#[tauri::command]
#[specta::specta]
pub fn add_color_preset(app: AppHandle, tool: String, color: String) -> Result<(), String> {
    let mut s = app.state::<AppState>().settings.read().unwrap().clone();
    s.styles.add_preset(&tool, &color)?;
    settings::update(&app, s).map(|_| ())
}

/// Change (`color` given) or delete (`None`) a preset of the palette the
/// given tool uses (right-click on a swatch). Returns a message to show if it can't.
#[tauri::command]
#[specta::specta]
pub fn edit_color_preset(
    app: AppHandle,
    tool: String,
    index: u32,
    color: Option<String>,
) -> Result<(), String> {
    let mut s = app.state::<AppState>().settings.read().unwrap().clone();
    s.styles
        .edit_preset(&tool, index as usize, color.as_deref())?;
    settings::update(&app, s).map(|_| ())
}

/// Open (or focus) the settings window, e.g. from the editor's status bar.
#[tauri::command]
#[specta::specta]
pub fn open_settings(app: AppHandle) {
    crate::settings_window::open(&app);
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

/// Installed font families for the text tool's font picker (cached after the
/// first call).
#[tauri::command]
#[specta::specta]
pub async fn list_fonts() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(crate::fonts::list)
        .await
        .unwrap_or_default()
}

/// The tool styles remembered from earlier windows (JSON text), or null: none
/// yet, or `editor.rememberToolStyles` is off.
#[tauri::command]
#[specta::specta]
pub fn get_tool_styles(app: AppHandle) -> Option<String> {
    crate::tool_styles::load(&app)
}

/// Remember the tools' current styles (JSON text) for the next window.
#[tauri::command]
#[specta::specta]
pub fn set_tool_styles(app: AppHandle, styles: String) {
    crate::tool_styles::save(&app, &styles);
}
