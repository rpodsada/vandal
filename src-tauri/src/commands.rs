//! All `#[tauri::command]`s. TS bindings are generated into
//! `src/shared/bindings.ts` on debug runs; call them via `src/shared/ipc.ts`.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::editor::{
    self, CloseChoice, EditorInit, ExportAction, ExportMarkup, ExportOutcome, LeaveReason,
};
use crate::folder::{FolderPosition, FolderStep};
use crate::frames::CaptureId;
use crate::geometry::PhysicalRect;
use crate::ocr::{OcrError, OcrLine};
use crate::output;
use crate::session::{
    self, CaptureTarget, OverlayLoad, OverlayReport, QuickAction, QuickMarkup, QuickOutcome,
};
use crate::settings::{self, Settings};
use crate::state::AppState;
use crate::updater::{self, UpdateInfo};

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

/// Window mode (PLAN 3H) turned on or off, or the window under the pointer
/// changed, on one overlay; every overlay follows.
#[tauri::command]
#[specta::specta]
pub fn window_pick_changed(
    app: AppHandle,
    capture_id: CaptureId,
    picking: bool,
    hovered: Option<u32>,
) {
    session::window_pick_changed(&app, capture_id, picking, hovered);
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

/// Settings is recording a new shortcut: pause ours, so pressing one is
/// recorded instead of starting a capture.
#[tauri::command]
#[specta::specta]
pub fn hotkeys_pause(app: AppHandle) {
    crate::hotkeys::pause(&app);
}

/// Recording finished: our shortcuts again, as settings have them now.
#[tauri::command]
#[specta::specta]
pub fn hotkeys_resume(app: AppHandle) {
    crate::hotkeys::resume(&app);
}

/// Whether a just-recorded shortcut can be ours; the reason if not.
#[tauri::command]
#[specta::specta]
pub fn hotkey_check(app: AppHandle, hotkey: String) -> Option<String> {
    crate::hotkeys::check(&app, &hotkey).err()
}

/// A just-recorded markup shortcut (PLAN 3F): spelled as settings store it,
/// or why it can't be one (fixed in Vandal, or held by Windows or another app,
/// which would take the keys first). Another tool using it is for the caller.
#[tauri::command]
#[specta::specta]
pub fn shortcut_check(app: AppHandle, shortcut: String) -> Result<String, String> {
    let combo = crate::shortcuts::check_one(&shortcut)?;
    // A letter alone can't be a global shortcut worth holding.
    if combo.contains('+') {
        crate::hotkeys::check(&app, &combo)?;
    }
    Ok(combo)
}

/// Whether Windows keeps PrintScreen for its own screen capture.
#[tauri::command]
#[specta::specta]
pub fn print_screen_opens_snipping() -> bool {
    crate::hotkeys::print_screen_opens_snipping()
}

/// Windows Settings › Accessibility › Keyboard (the Print Screen switch).
#[tauri::command]
#[specta::specta]
pub fn open_keyboard_settings() {
    let _ = std::process::Command::new("explorer.exe")
        .arg("ms-settings:easeofaccess-keyboard")
        .spawn();
}

/// Vandal's project page, in the default browser (Settings › About). A fixed
/// address: the page can't open others.
#[tauri::command]
#[specta::specta]
pub fn open_project_page() {
    let _ = std::process::Command::new("explorer.exe")
        .arg("https://github.com/rpodsada/vandal")
        .spawn();
}

/// Vandal's website, in the default browser (Settings › About). A fixed
/// address, like `open_project_page`.
#[tauri::command]
#[specta::specta]
pub fn open_website() {
    let _ = std::process::Command::new("explorer.exe")
        .arg("https://vandalscreenshot.com")
        .spawn();
}

/// The quick start guide on the website (Settings › About, the welcome
/// toast's Guide). A fixed address, like `open_project_page`.
#[tauri::command]
#[specta::specta]
pub fn open_quick_start() {
    let _ = std::process::Command::new("explorer.exe")
        .arg("https://vandalscreenshot.com/docs/quick-start/")
        .spawn();
}

/// The browser extension's Chrome Web Store page (Settings › About). A fixed
/// address, like `open_project_page`.
#[tauri::command]
#[specta::specta]
pub fn open_extension_page() {
    let _ = std::process::Command::new("explorer.exe")
        .arg("https://chromewebstore.google.com/detail/vandal-screen-capture/glniniimcccgnpgfddfdepdnpbajpnfc")
        .spawn();
}

/// Where the editor's image file is in its folder ("12 of 41"), PLAN 3Q.
/// None for captures and pasted images.
#[tauri::command]
#[specta::specta]
pub async fn editor_folder_position(
    app: AppHandle,
    window: WebviewWindow,
) -> Option<FolderPosition> {
    let id = editor::id_from_label(window.label())?;
    tauri::async_runtime::spawn_blocking(move || editor::folder_position(&app, id))
        .await
        .ok()
        .flatten()
}

/// Left/Right/Home/End in the editor: the folder's previous, next, first or
/// last image (`by` along, for presses that piled up) takes this one's place
/// (PLAN 3Q), after the page has asked about unsaved changes. The page then
/// loads it itself (`editor_init`), with no reload. Returns its position;
/// None if there's nowhere to go.
#[tauri::command]
#[specta::specta]
pub async fn editor_flip(
    app: AppHandle,
    window: WebviewWindow,
    step: FolderStep,
    by: u32,
) -> Result<Option<FolderPosition>, String> {
    let Some(id) = editor::id_from_label(window.label()) else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || editor::flip(&app, id, step, by))
        .await
        .map_err(|e| e.to_string())?
}

/// GitHub's new-issue page, to report a bug or suggest an idea (Settings ›
/// About). A fixed address, like `open_project_page`.
#[tauri::command]
#[specta::specta]
pub fn open_issues() {
    let _ = std::process::Command::new("explorer.exe")
        .arg("https://github.com/rpodsada/vandal/issues/new")
        .spawn();
}

/// The default settings, for "Reset" buttons.
#[tauri::command]
#[specta::specta]
pub fn default_settings() -> crate::settings::Settings {
    crate::settings::Settings::default()
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

/// Copy or save `crop` of the base image with `markup` (see [`ExportMarkup`]).
/// `layerMs` (render + upload time in the page) is only for the perf log.
#[tauri::command]
#[specta::specta]
pub async fn editor_export(
    app: AppHandle,
    window: WebviewWindow,
    crop: PhysicalRect,
    markup: ExportMarkup,
    action: ExportAction,
    layer_ms: Option<f64>,
) -> Result<ExportOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        editor::export(&app, &window, crop, markup, action, layer_ms)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Ask whether to save unsaved changes before the editor's document goes
/// (it closes, or another image replaces it).
#[tauri::command]
#[specta::specta]
pub async fn editor_confirm_close(
    app: AppHandle,
    window: WebviewWindow,
    reason: LeaveReason,
) -> CloseChoice {
    tauri::async_runtime::spawn_blocking(move || editor::confirm_close(&app, &window, reason))
        .await
        .unwrap_or(CloseChoice::Cancel)
}

/// Start a new region capture from the editor.
#[tauri::command]
#[specta::specta]
pub fn editor_new_capture(app: AppHandle, window: WebviewWindow) {
    editor::new_capture(&app, &window);
}

/// Ctrl+O / "Open", step 1: pick image files (none if dismissed).
#[tauri::command]
#[specta::specta]
pub async fn editor_pick_images(app: AppHandle, window: WebviewWindow) -> Vec<String> {
    editor::pick_images(&app, Some(&window))
        .into_iter()
        .map(|p| p.display().to_string())
        .collect()
}

/// Ctrl+O / "Open", step 2, once the page has dealt with its document: the
/// first file loads into this editor, the rest in new windows (PLAN 3H.6).
#[tauri::command]
#[specta::specta]
pub fn editor_open_here(app: AppHandle, window: WebviewWindow, paths: Vec<String>) {
    let Some(id) = editor::id_from_label(window.label()) else {
        return;
    };
    editor::open_files_here(&app, id, paths.into_iter().map(PathBuf::from).collect());
}

/// Ctrl+V in an empty editor (PLAN 3G): the clipboard's image loads into it.
#[tauri::command]
#[specta::specta]
pub fn editor_paste(app: AppHandle, window: WebviewWindow) {
    editor::open_clipboard(&app, editor::empty_editor(&app, window.label()));
}

/// The clipboard's text, for the editor's markup paste (`markupJson.ts`).
#[tauri::command]
#[specta::specta]
pub fn clipboard_text() -> Result<String, String> {
    output::paste_text()
}

/// Whether the clipboard holds an image: Ctrl+V explains it can't paste one
/// over an image (PLAN 3R).
#[tauri::command]
#[specta::specta]
pub fn clipboard_has_image() -> bool {
    crate::clipboard::has_image()
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

/// What a file saved now with this template would be called (in the save
/// folder, for its auto number).
#[tauri::command]
#[specta::specta]
pub fn preview_filename(app: AppHandle, template: String) -> String {
    let dir = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .save
        .directory
        .clone();
    format!(
        "{}.png",
        output::file_stem(&output::resolve_dir(&dir), &template)
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

/// The text in the editor's image, for redacting it (PLAN 3J): lines of
/// words, in image pixels.
#[tauri::command]
#[specta::specta]
pub async fn editor_recognize_text(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Vec<OcrLine>, OcrError> {
    let id = crate::editor::id_from_label(window.label())
        .ok_or_else(|| OcrError::failed("Not an editor window."))?;
    let image = app
        .state::<AppState>()
        .editors
        .lock()
        .unwrap()
        .image(id)
        .ok_or_else(|| OcrError::failed("The editor has no image."))?;
    recognize_text(app, image).await
}

/// The text in `rect` of a capture (quick edit's selection, PLAN 3J), in
/// virtual-desktop physical pixels like `rect`.
#[tauri::command]
#[specta::specta]
pub async fn quick_recognize_text(
    app: AppHandle,
    capture_id: CaptureId,
    rect: PhysicalRect,
) -> Result<Vec<OcrLine>, OcrError> {
    let capture = app
        .state::<AppState>()
        .frames
        .lock()
        .unwrap()
        .get(capture_id)
        .ok_or_else(|| OcrError::failed("The capture is no longer in memory."))?;
    let frames: Vec<&crate::capture::MonitorFrame> =
        capture.frames.iter().map(|f| f.as_ref()).collect();
    let image = crate::compose::compose(&frames, rect)
        .ok_or_else(|| OcrError::failed("The selection is empty."))?;
    let mut lines = recognize_text(app, std::sync::Arc::new(image)).await?;
    for word in lines.iter_mut().flat_map(|l| l.words.iter_mut()) {
        word.rect = word.rect.translate(rect.x, rect.y);
    }
    Ok(lines)
}

/// Settings › Updates' "Check now" (PLAN 3P): the newer version, if any.
#[tauri::command]
#[specta::specta]
pub async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    updater::check(&app, false).await
}

/// The update the last check found, for pages that open later.
#[tauri::command]
#[specta::specta]
pub fn update_available(app: AppHandle) -> Option<UpdateInfo> {
    updater::available(&app)
}

/// Install the update found and restart into it. Returns only if something
/// stopped it (a capture on screen, an editor that stayed open, a failed
/// download).
#[tauri::command]
#[specta::specta]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    updater::install(&app).await
}

/// A release's notes on GitHub, in the default browser (Settings › Updates'
/// "What's new"). Only a version number goes into the address.
#[tauri::command]
#[specta::specta]
pub fn open_release_notes(version: String) {
    updater::open_release_notes(&version);
}

/// The editor page's document gained or lost unsaved changes, so the update
/// notification can say whether installing will ask about them.
#[tauri::command]
#[specta::specta]
pub fn editor_set_unsaved(app: AppHandle, window: WebviewWindow, unsaved: bool) {
    if let Some(id) = editor::id_from_label(window.label()) {
        let state = app.state::<AppState>();
        state.editors.lock().unwrap().set_unsaved(id, unsaved);
    }
}

/// An editor asked to leave for an update kept its document instead.
#[tauri::command]
#[specta::specta]
pub fn update_editor_kept(app: AppHandle) {
    updater::editor_kept(&app);
}

async fn recognize_text(
    app: AppHandle,
    image: std::sync::Arc<crate::compose::RgbaImage>,
) -> Result<Vec<OcrLine>, OcrError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let started = std::time::Instant::now();
        let result = state.text_recognizer.recognize(&image);
        let words: usize = result
            .as_ref()
            .map(|lines| lines.iter().map(|l| l.words.len()).sum())
            .unwrap_or(0);
        eprintln!(
            "[perf] ocr ({}) {}×{}: {:.1}ms, {words} words",
            state.text_recognizer.name(),
            image.width,
            image.height,
            started.elapsed().as_secs_f64() * 1000.0
        );
        result
    })
    .await
    .map_err(OcrError::failed)?
}
