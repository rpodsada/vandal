//! User settings (PLAN §4.7): versioned JSON in `tauri-plugin-store`, with Rust
//! as the source of truth. Every struct is `#[serde(default)]` so files written
//! by older versions (missing fields) load with defaults filled in.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use tauri::{AppHandle, Wry};
use tauri_plugin_store::StoreExt;

pub const CURRENT_VERSION: u32 = 1;
const STORE_FILE: &str = "settings.json";
const STORE_KEY: &str = "settings";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub hotkeys: Hotkeys,
    pub after_capture: AfterCapture,
    pub save: SaveSettings,
    pub overlay: OverlaySettings,
    pub editor: EditorSettings,
    pub startup: Startup,
    pub history: History,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            hotkeys: Hotkeys::default(),
            after_capture: AfterCapture::default(),
            save: SaveSettings::default(),
            overlay: OverlaySettings::default(),
            editor: EditorSettings::default(),
            startup: Startup::default(),
            history: History::default(),
        }
    }
}

/// Human-readable accelerators, e.g. `"Win+Shift+F12"`. `None` = unassigned.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct Hotkeys {
    pub region: Option<String>,
    pub fullscreen: Option<String>,
    /// Window capture arrives in Phase 4; not registered yet.
    pub window: Option<String>,
    pub repeat_last: Option<String>,
}

impl Default for Hotkeys {
    fn default() -> Self {
        // PrintScreen is often claimed by Windows/OneDrive/other tools and many
        // compact keyboards lack it; Win+F12 combos are free on stock Windows.
        Self {
            region: Some("Win+F12".into()),
            fullscreen: Some("Win+Shift+F12".into()),
            window: Some("Win+Alt+F12".into()),
            repeat_last: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct AfterCapture {
    pub copy_to_clipboard: bool,
    /// The editor arrives in Phase 2.
    pub open_editor: bool,
    pub auto_save: bool,
}

impl Default for AfterCapture {
    fn default() -> Self {
        Self {
            copy_to_clipboard: true,
            open_editor: true,
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
}

impl Default for SaveSettings {
    fn default() -> Self {
        Self {
            directory: r"%USERPROFILE%\Pictures\Screenshots".into(),
            filename_template: "Screenshot {yyyy}-{MM}-{dd} {HH}-{mm}-{ss}".into(),
            format: "png".into(),
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct EditorSettings {
    /// Shape defined in Phase 3.
    #[specta(type = Vec<specta_typescript::Unknown>)]
    pub tool_presets: Vec<Value>,
    pub default_tool: String,
    pub theme: String,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            tool_presets: Vec::new(),
            default_tool: "arrow".into(),
            theme: "system".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct Startup {
    pub launch_on_login: bool,
}

impl Default for Startup {
    fn default() -> Self {
        Self {
            launch_on_login: true,
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
            let changed = version != u64::from(CURRENT_VERSION);
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
            "version": 1,
            "afterCapture": { "autoSave": true },
        })));
        assert!(!changed);
        assert!(s.after_capture.auto_save);
        assert!(s.after_capture.copy_to_clipboard, "missing field defaults");
        assert_eq!(s.save, SaveSettings::default());
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
        let (s, _) = migrate(Some(json!({ "version": 1, "fromTheFuture": true })));
        assert_eq!(s, Settings::default());
    }

    #[test]
    fn wrong_types_fall_back_to_defaults() {
        let (s, changed) = migrate(Some(
            json!({ "version": 1, "overlay": { "dimOpacity": "x" } }),
        ));
        assert!(changed);
        assert_eq!(s, Settings::default());
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
    fn default_shape_matches_plan() {
        let v = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(v["version"], 1);
        assert_eq!(v["hotkeys"]["region"], "Win+F12");
        assert_eq!(v["afterCapture"]["copyToClipboard"], true);
        assert_eq!(v["save"]["format"], "png");
        assert_eq!(v["history"]["keepFramesInMemory"], 3);
    }
}
