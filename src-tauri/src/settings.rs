//! User settings (PLAN §4.7): versioned JSON in `tauri-plugin-store`, with Rust
//! as the source of truth. Every struct is `#[serde(default)]` so files written
//! by older versions (missing fields) load with defaults filled in.
//!
//! Adding a field needs no version bump: `#[serde(default)]` fills it in.
//! Bump [`CURRENT_VERSION`] and add a step to [`migrate`] only when renaming,
//! moving or reinterpreting existing fields.
//!
//! Changes go through [`update`], which validates, saves, applies them live
//! (hotkeys, tray, autostart...) and broadcasts [`SettingsChanged`].

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_store::StoreExt;
use tauri_specta::Event;

use crate::shortcuts::Shortcuts;
use crate::state::AppState;
use crate::styles::Styles;

pub const CURRENT_VERSION: u32 = 4;
const STORE_FILE: &str = "settings.json";
const STORE_KEY: &str = "settings";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub hotkeys: Hotkeys,
    /// The markup's keys for tools and swapping colors (PLAN 3F).
    pub shortcuts: Shortcuts,
    pub after_capture: AfterCapture,
    pub save: SaveSettings,
    pub overlay: OverlaySettings,
    pub quick_edit: QuickEditSettings,
    pub editor: EditorSettings,
    /// How the app looks (PLAN 3A).
    pub appearance: Appearance,
    /// Style pickers for the markup tools.
    pub styles: Styles,
    pub startup: Startup,
    pub history: History,
    pub tray: TraySettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            hotkeys: Hotkeys::default(),
            shortcuts: Shortcuts::default(),
            after_capture: AfterCapture::default(),
            save: SaveSettings::default(),
            overlay: OverlaySettings::default(),
            quick_edit: QuickEditSettings::default(),
            editor: EditorSettings::default(),
            appearance: Appearance::default(),
            styles: Styles::default(),
            startup: Startup::default(),
            history: History::default(),
            tray: TraySettings::default(),
        }
    }
}

/// Light, dark, or following Windows.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct Appearance {
    pub theme: ThemeMode,
    /// `"windows"` (the Windows accent color) or a `#rrggbb` the user picked.
    pub accent: String,
}

/// Follow the Windows accent color.
pub const WINDOWS_ACCENT: &str = "windows";

impl Default for Appearance {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            accent: WINDOWS_ACCENT.into(),
        }
    }
}

/// Human-readable accelerators, e.g. `"Win+Shift+F12"`. `None` = unassigned.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct Hotkeys {
    pub region: Option<String>,
    pub fullscreen: Option<String>,
    /// Window capture (PLAN 3H.4): the overlay opens in window mode.
    pub window: Option<String>,
    pub repeat_last: Option<String>,
}

impl Default for Hotkeys {
    fn default() -> Self {
        // PrintScreen is often claimed by Windows/OneDrive/other tools and many
        // compact keyboards lack it; Win+F12 combos are free on stock Windows.
        // Dev builds (separate identity, see tauri.dev.conf.json) add Ctrl so
        // they can run alongside an installed copy without hotkey clashes.
        let key = |k: &str| {
            Some(if cfg!(debug_assertions) {
                format!("Ctrl+{k}")
            } else {
                k.to_string()
            })
        };
        Self {
            region: key("Win+F12"),
            fullscreen: key("Win+Shift+F12"),
            window: key("Win+Alt+F12"),
            repeat_last: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct AfterCapture {
    pub copy_to_clipboard: bool,
    /// Open captures in the editor. The other actions then wait for the
    /// editor, which copies/saves itself.
    pub open_editor: bool,
    pub auto_save: bool,
}

impl Default for AfterCapture {
    fn default() -> Self {
        Self {
            copy_to_clipboard: true,
            open_editor: false,
            auto_save: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct SaveSettings {
    /// May contain `%ENV%` variables.
    pub directory: String,
    /// Tokens: `{yyyy} {MM} {dd} {HH} {mm} {ss}`.
    pub filename_template: String,
    pub format: String,
    /// Offer a "Save" button on the capture notification when not auto-saved.
    pub notification_save_button: bool,
}

impl Default for SaveSettings {
    fn default() -> Self {
        Self {
            directory: r"%USERPROFILE%\Pictures\Screenshots".into(),
            filename_template: "Screenshot {yyyy}-{MM}-{dd} {HH}-{mm}-{ss}".into(),
            format: "png".into(),
            notification_save_button: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct OverlaySettings {
    pub dim_opacity: f64,
    pub show_loupe: bool,
    pub show_dimensions: bool,
}

impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            dim_opacity: 0.4,
            show_loupe: true,
            show_dimensions: true,
        }
    }
}

/// Quick edit (PLAN Phase 2): a toolbar on the selection screen to copy, save
/// or mark up a region capture before it's delivered.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct QuickEditSettings {
    /// Off: the selection screen works as in Phase 1 (Enter captures).
    pub enabled: bool,
    /// Ctrl+C / Copy also closes quick edit (and runs the actions still pending).
    pub close_on_copy: bool,
    /// Ctrl+S / Save also closes quick edit.
    pub close_on_save: bool,
}

impl Default for QuickEditSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            close_on_copy: true,
            close_on_save: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct EditorSettings {
    /// Shape defined in Phase 3.
    #[specta(type = Vec<specta_typescript::Unknown>)]
    pub tool_presets: Vec<Value>,
    pub default_tool: String,
    /// Show an "Edit" button on capture notifications. Clicking the
    /// notification itself opens the editor either way.
    pub notification_edit_button: bool,
    /// What closing the editor does with the image (unless already done since
    /// the last change).
    pub on_close: EditorOnClose,
    /// Tools on the global palette share one current color; off = each tool
    /// remembers its own.
    pub share_color: bool,
    /// Slot-number badges and shortcut tooltips on the style pickers.
    pub show_shortcut_hints: bool,
    /// Number buttons in the options bar show their unit ("50%", "10px").
    /// Off by default: it adds clutter (Richard's call).
    pub show_button_units: bool,
    /// With a drawing tool, pressing on an object selects it (off: drawing
    /// tools always draw). Ctrl flips this for one press.
    pub drawing_tools_select: bool,
    /// New windows start with the tools' styles as last used (colors, widths,
    /// fonts...), also after a restart. Off: they start from the defaults.
    pub remember_tool_styles: bool,
    /// Warn before the first save over an opened image file (PLAN 2D).
    pub confirm_overwrite: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct EditorOnClose {
    pub copy: bool,
    pub save: bool,
}

impl Default for EditorOnClose {
    fn default() -> Self {
        Self {
            copy: true,
            save: false,
        }
    }
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            tool_presets: Vec::new(),
            default_tool: "arrow".into(),
            notification_edit_button: true,
            on_close: EditorOnClose::default(),
            share_color: false,
            show_shortcut_hints: true,
            show_button_units: false,
            drawing_tools_select: true,
            remember_tool_styles: true,
            confirm_overwrite: true,
        }
    }
}

/// What clicking the tray icon or launching Vandal does (PLAN 3G).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum IconAction {
    /// A region capture.
    #[default]
    Capture,
    /// An empty editor window.
    Editor,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct Startup {
    pub launch_on_login: bool,
    /// Launching Vandal (its desktop or Start menu icon). While it's running:
    /// this. When it isn't: it starts in the tray, and opens the editor if
    /// that's the choice, but never starts a capture. Never on login.
    pub launch_action: IconAction,
}

impl Default for Startup {
    fn default() -> Self {
        Self {
            launch_on_login: true,
            launch_action: IconAction::Capture,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct History {
    pub keep_frames_in_memory: u32,
}

impl Default for History {
    fn default() -> Self {
        Self {
            keep_frames_in_memory: 3,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct TraySettings {
    // `showAutoSaveToggle` (an auto-save switch in the tray menu) was dropped
    // in 3H.10; older files' value is ignored.
    /// Clicking the tray icon (PLAN 3G).
    pub click_action: IconAction,
}

/// Rust → all windows: settings changed (from any source), here's the new state.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct SettingsChanged(pub Settings);

/// Normalize values and reject ones that can't work. Returns the settings as
/// they will be stored.
pub fn validate(mut s: Settings) -> Result<Settings, String> {
    s.version = CURRENT_VERSION;
    s.save.directory = s.save.directory.trim().to_string();
    if s.save.directory.is_empty() {
        return Err("Choose a folder to save screenshots in.".into());
    }
    s.save.filename_template = s.save.filename_template.trim().to_string();
    if s.save.filename_template.is_empty() {
        return Err("The file name can't be empty.".into());
    }
    if !s.overlay.dim_opacity.is_finite() {
        s.overlay.dim_opacity = OverlaySettings::default().dim_opacity;
    }
    s.overlay.dim_opacity = s.overlay.dim_opacity.clamp(0.0, 0.9);
    s.history.keep_frames_in_memory = s.history.keep_frames_in_memory.clamp(1, 20);
    s.styles = s.styles.normalized();
    s.shortcuts = s.shortcuts.checked()?;
    let captures = [
        (&s.hotkeys.region, "a region"),
        (&s.hotkeys.fullscreen, "the full screen"),
        (&s.hotkeys.window, "a window"),
    ];
    for (i, (a, what_a)) in captures.iter().enumerate() {
        for (b, what_b) in &captures[i + 1..] {
            if let (Some(a), Some(b)) = (a, b) {
                if a.eq_ignore_ascii_case(b) {
                    return Err(format!(
                        "{a} can't capture both {what_a} and {what_b}: pick another shortcut."
                    ));
                }
            }
        }
    }
    s.appearance.accent = crate::styles::normalize_color(&s.appearance.accent)
        .unwrap_or_else(|| WINDOWS_ACCENT.into());
    Ok(s)
}

/// Validate, persist, apply live and broadcast. Returns the stored settings.
pub fn update(app: &AppHandle<Wry>, new: Settings) -> Result<Settings, String> {
    let new = validate(new)?;
    let state = app.state::<AppState>();
    let old = {
        let mut current = state.settings.write().unwrap();
        if *current == new {
            return Ok(new);
        }
        std::mem::replace(&mut *current, new.clone())
    };
    save(app, &new)?;

    if old.hotkeys != new.hotkeys {
        crate::hotkeys::register(app, &new.hotkeys);
    }
    if old.startup.launch_on_login != new.startup.launch_on_login {
        crate::tray::apply_autostart(app, new.startup.launch_on_login);
    }
    if old.history != new.history {
        state
            .frames
            .lock()
            .unwrap()
            .set_capacity(new.history.keep_frames_in_memory as usize);
    }
    if old.appearance.theme != new.appearance.theme {
        crate::appearance::apply(app, new.appearance.theme);
    }
    crate::tray::refresh(app, &new);

    let _ = SettingsChanged(new.clone()).emit(app);
    Ok(new)
}

/// Apply `change` to the current settings and [`update`].
pub fn modify(
    app: &AppHandle<Wry>,
    change: impl FnOnce(&mut Settings),
) -> Result<Settings, String> {
    let mut s = app.state::<AppState>().settings.read().unwrap().clone();
    change(&mut s);
    update(app, s)
}

/// Bring stored JSON up to [`CURRENT_VERSION`]. Returns the settings and
/// whether anything changed (so the caller knows to write them back).
///
/// Add one step per version bump, e.g. `if version < 2 { rename a field }`.
pub fn migrate(stored: Option<Value>) -> (Settings, bool) {
    let Some(value) = stored.filter(Value::is_object) else {
        return (Settings::default(), true);
    };
    let version = value.get("version").and_then(Value::as_u64).unwrap_or(0);
    // v0 (no version field) → v1: same shape.

    match serde_json::from_value::<Settings>(value.clone()) {
        Ok(mut settings) => {
            // v1 → v2: `openEditor` defaulted to true before the editor existed,
            // so a stored true was never a choice. Quick edit is the default flow now.
            if version < 2 {
                settings.after_capture.open_editor = false;
            }
            // v2 → v3: `editor.shareColor` defaulted to true and had no control
            // in Settings, so a stored true was never a choice. Per-tool colors
            // are the default now that tool styles are remembered.
            if version < 3 {
                settings.editor.share_color = false;
            }
            // v3 → v4: the callout tool (PLAN 3E) comes with its own thickness
            // dropdown. Stored per-tool styles replace the default map, so add it.
            if version < 4 {
                settings
                    .styles
                    .tools
                    .entry("callout".to_string())
                    .or_insert_with(crate::styles::ToolStyles::callout_default);
            }
            // Hand edits can leave picker specs the pages can't draw.
            let styles = settings.styles.clone().normalized();
            let mut changed = version != u64::from(CURRENT_VERSION) || styles != settings.styles;
            settings.styles = styles;
            // Edited by hand into something that can't work: the defaults.
            match settings.shortcuts.clone().checked() {
                Ok(shortcuts) => {
                    changed |= shortcuts != settings.shortcuts;
                    settings.shortcuts = shortcuts;
                }
                Err(e) => {
                    eprintln!("[settings] markup shortcuts ({e}); using defaults");
                    settings.shortcuts = Shortcuts::default();
                    changed = true;
                }
            }
            settings.version = CURRENT_VERSION;
            (settings, changed)
        }
        Err(e) => {
            eprintln!("[settings] unreadable settings ({e}); using defaults");
            (Settings::default(), true)
        }
    }
}

/// What to do with the raw settings file before the store parses it.
#[derive(Debug, PartialEq)]
enum Repair {
    None,
    /// Rewrite without the UTF-8 BOM (Notepad and PowerShell add one; JSON
    /// parsers reject it).
    StripBom(Vec<u8>),
    /// Unparseable: keep a copy before defaults overwrite it.
    Quarantine,
}

fn check_raw(bytes: &[u8]) -> Repair {
    let (body, had_bom) = match bytes.strip_prefix(b"\xEF\xBB\xBF") {
        Some(rest) => (rest, true),
        None => (bytes, false),
    };
    if serde_json::from_slice::<Value>(body).is_err() {
        Repair::Quarantine
    } else if had_bom {
        Repair::StripBom(body.to_vec())
    } else {
        Repair::None
    }
}

fn repair_file(app: &AppHandle<Wry>) {
    use tauri::Manager;
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let path = dir.join(STORE_FILE);
    let Ok(bytes) = std::fs::read(&path) else {
        return; // first run
    };
    match check_raw(&bytes) {
        Repair::None => {}
        Repair::StripBom(body) => {
            eprintln!("[settings] stripping UTF-8 BOM from {}", path.display());
            let _ = std::fs::write(&path, body);
        }
        Repair::Quarantine => {
            let backup = dir.join("settings.corrupt.json");
            eprintln!(
                "[settings] {} is not valid JSON; moved to {} and using defaults",
                path.display(),
                backup.display()
            );
            let _ = std::fs::rename(&path, &backup);
        }
    }
}

pub fn load(app: &AppHandle<Wry>) -> Settings {
    repair_file(app);
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[settings] cannot open store: {e}; using defaults");
            return Settings::default();
        }
    };
    let (settings, changed) = migrate(store.get(STORE_KEY));
    if changed {
        if let Err(e) = save(app, &settings) {
            eprintln!("[settings] cannot save: {e}");
        }
    }
    settings
}

pub fn save(app: &AppHandle<Wry>, settings: &Settings) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(
        STORE_KEY,
        serde_json::to_value(settings).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_store_gives_defaults_and_saves() {
        assert_eq!(migrate(None), (Settings::default(), true));
    }

    #[test]
    fn non_object_gives_defaults() {
        assert_eq!(migrate(Some(json!("garbage"))), (Settings::default(), true));
        assert_eq!(migrate(Some(json!([1, 2]))), (Settings::default(), true));
    }

    #[test]
    fn current_version_round_trips_unchanged() {
        let mut s = Settings::default();
        s.overlay.dim_opacity = 0.7;
        s.hotkeys.region = None;
        let (loaded, changed) = migrate(Some(serde_json::to_value(&s).unwrap()));
        assert_eq!(loaded, s);
        assert!(!changed);
    }

    #[test]
    fn partial_file_fills_defaults() {
        let (s, changed) = migrate(Some(json!({
            "version": 4,
            "afterCapture": { "autoSave": true },
        })));
        assert!(!changed);
        assert!(s.after_capture.auto_save);
        assert!(s.after_capture.copy_to_clipboard, "missing field defaults");
        assert_eq!(s.save, SaveSettings::default());
    }

    #[test]
    fn v3_stored_tool_styles_gain_the_callout_default() {
        let v3 = json!({ "version": 3, "styles": { "tools": { "pen": { "width": { "control": "slider", "min": 1, "max": 9 } } } } });
        let (s, changed) = migrate(Some(v3));
        assert!(changed);
        assert!(s.styles.tools.contains_key("pen"), "stored overrides kept");
        assert_eq!(
            s.styles.tools["callout"],
            crate::styles::ToolStyles::callout_default()
        );
        // From v4 on, a removed callout override stays removed.
        let v4 = json!({ "version": 4, "styles": { "tools": {} } });
        assert!(migrate(Some(v4)).0.styles.tools.is_empty());
    }

    #[test]
    fn unversioned_file_is_upgraded() {
        let (s, changed) = migrate(Some(json!({ "overlay": { "dimOpacity": 0.2 } })));
        assert!(changed);
        assert_eq!(s.version, CURRENT_VERSION);
        assert_eq!(s.overlay.dim_opacity, 0.2);
    }

    #[test]
    fn unknown_fields_are_ignored() {
        let (s, _) = migrate(Some(json!({ "version": 3, "fromTheFuture": true })));
        assert_eq!(s, Settings::default());
    }

    #[test]
    fn wrong_types_fall_back_to_defaults() {
        let (s, changed) = migrate(Some(
            json!({ "version": 2, "overlay": { "dimOpacity": "x" } }),
        ));
        assert!(changed);
        assert_eq!(s, Settings::default());
    }

    #[test]
    fn v1_open_editor_is_reset() {
        let v1 = json!({ "version": 1, "afterCapture": { "openEditor": true, "autoSave": true } });
        let (s, changed) = migrate(Some(v1));
        assert!(changed);
        assert!(!s.after_capture.open_editor);
        assert!(s.after_capture.auto_save, "other fields kept");

        let v4 = json!({ "version": 4, "afterCapture": { "openEditor": true } });
        let (s, changed) = migrate(Some(v4));
        assert!(!changed);
        assert!(s.after_capture.open_editor, "a later choice is kept");
    }

    #[test]
    fn v2_share_color_is_reset() {
        let v2 =
            json!({ "version": 2, "editor": { "shareColor": true, "onClose": { "copy": false } } });
        let (s, changed) = migrate(Some(v2));
        assert!(changed);
        assert!(!s.editor.share_color);
        assert!(!s.editor.on_close.copy, "other fields kept");

        let v3 = json!({ "version": 3, "editor": { "shareColor": true } });
        assert!(
            migrate(Some(v3)).0.editor.share_color,
            "a v3 choice is kept"
        );
    }

    #[test]
    fn raw_file_checks() {
        assert_eq!(check_raw(br#"{"settings":{}}"#), Repair::None);
        assert_eq!(
            check_raw(b"\xEF\xBB\xBF{\"a\":1}"),
            Repair::StripBom(b"{\"a\":1}".to_vec())
        );
        assert_eq!(check_raw(b"{not json"), Repair::Quarantine);
        assert_eq!(check_raw(b"\xEF\xBB\xBF{not json"), Repair::Quarantine);
    }

    #[test]
    fn accent_is_windows_or_a_color() {
        let mut s = Settings::default();
        assert_eq!(s.appearance.accent, WINDOWS_ACCENT);
        s.appearance.accent = "#ABC".into();
        assert_eq!(validate(s.clone()).unwrap().appearance.accent, "#aabbcc");
        s.appearance.accent = "blue".into();
        assert_eq!(validate(s).unwrap().appearance.accent, WINDOWS_ACCENT);
    }

    #[test]
    fn one_shortcut_cant_do_two_things() {
        let mut s = Settings::default();
        s.hotkeys.region = Some("Ctrl+Win+F9".into());
        s.hotkeys.fullscreen = Some("ctrl+win+f9".into());
        assert!(validate(s.clone()).is_err());
        s.hotkeys.fullscreen = None;
        assert!(validate(s.clone()).is_ok());
        s.hotkeys.window = Some("CTRL+WIN+F9".into());
        let e = validate(s).unwrap_err();
        assert!(e.contains("a region and a window"), "{e}");
    }

    #[test]
    fn validate_normalizes() {
        let mut s = Settings::default();
        s.save.directory = "  C:/shots  ".into();
        s.overlay.dim_opacity = 5.0;
        s.history.keep_frames_in_memory = 0;
        s.version = 0;
        let v = validate(s).unwrap();
        assert_eq!(v.save.directory, "C:/shots");
        assert_eq!(v.overlay.dim_opacity, 0.9);
        assert_eq!(v.history.keep_frames_in_memory, 1);
        assert_eq!(v.version, CURRENT_VERSION);

        let mut s = Settings::default();
        s.overlay.dim_opacity = f64::NAN;
        assert_eq!(validate(s).unwrap().overlay.dim_opacity, 0.4);
    }

    #[test]
    fn validate_rejects_unusable_values() {
        let mut s = Settings::default();
        s.save.directory = "   ".into();
        assert!(validate(s).is_err());
        let mut s = Settings::default();
        s.save.filename_template = "".into();
        assert!(validate(s).is_err());
    }

    #[test]
    fn older_files_get_new_fields_with_defaults() {
        let (s, _) = migrate(Some(
            json!({ "version": 1, "save": { "directory": "D:/x" } }),
        ));
        assert_eq!(s.save.directory, "D:/x");
        assert!(s.save.notification_save_button);
        assert!(s.editor.notification_edit_button);
    }

    #[test]
    fn default_shape_matches_plan() {
        let v = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(v["version"], 4);
        let region = if cfg!(debug_assertions) {
            "Ctrl+Win+F12"
        } else {
            "Win+F12"
        };
        assert_eq!(v["hotkeys"]["region"], region);
        assert_eq!(v["afterCapture"]["copyToClipboard"], true);
        assert_eq!(v["afterCapture"]["openEditor"], false);
        assert_eq!(v["editor"]["onClose"]["copy"], true);
        assert_eq!(v["editor"]["onClose"]["save"], false);
        assert_eq!(v["save"]["format"], "png");
        assert_eq!(v["history"]["keepFramesInMemory"], 3);
        assert_eq!(v["editor"]["shareColor"], false);
        assert_eq!(v["editor"]["showShortcutHints"], true);
        assert_eq!(v["editor"]["showButtonUnits"], false);
        assert_eq!(v["editor"]["drawingToolsSelect"], true);
        assert_eq!(v["editor"]["rememberToolStyles"], true);
        assert_eq!(v["styles"]["width"]["control"], "slider");
        assert_eq!(v["shortcuts"]["callout"], "O");
        assert_eq!(v["tray"]["clickAction"], "capture");
        assert_eq!(v["startup"]["launchAction"], "capture");
        assert_eq!(v["shortcuts"]["swapColors"], "X");
    }

    #[test]
    fn stored_shortcuts_are_checked_on_load() {
        let v = u64::from(CURRENT_VERSION);
        let (s, changed) = migrate(Some(
            json!({ "version": v, "shortcuts": { "pen": "ctrl+p" } }),
        ));
        assert!(changed);
        assert_eq!(s.shortcuts.pen.as_deref(), Some("Ctrl+P"));
        assert_eq!(s.shortcuts.line.as_deref(), Some("L"));
        // Unusable (Pen and Line both L): the defaults.
        let (s, changed) = migrate(Some(json!({ "version": v, "shortcuts": { "pen": "L" } })));
        assert!(changed);
        assert_eq!(s.shortcuts, Shortcuts::default());
        // Cleared stays cleared.
        let (s, _) = migrate(Some(json!({ "version": v, "shortcuts": { "pen": null } })));
        assert_eq!(s.shortcuts.pen, None);
    }

    #[test]
    fn stored_styles_are_repaired_on_load() {
        let (s, changed) = migrate(Some(json!({
            "version": 2,
            "styles": { "palette": ["#ABC", "bad"], "width": { "control": "slider", "min": 9, "max": 1 } },
        })));
        assert!(changed);
        assert_eq!(s.styles.palette, vec!["#aabbcc".to_string()]);
        assert_eq!(s.styles.width, Styles::default().width);
    }
}
