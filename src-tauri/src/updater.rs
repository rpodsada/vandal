//! Automatic updates (PLAN 3P) with `tauri-plugin-updater`, driven from Rust
//! only: no webview has the plugin's permission, the pages use our commands.
//!
//! Each channel's manifest is a static file on the `update-manifests` branch,
//! written by `publish-updates.yml` when a release is published. Checks run a
//! minute after startup and then daily, only while `updates.checkAutomatically`
//! is on; "Check now" always works. Installing never interrupts work: it waits
//! out a capture on screen, and asks every editor to leave the way closing
//! does (on-close copy, or "save first?"), giving up if one stays.
//!
//! Dev builds never check by themselves. `VANDAL_UPDATE_ENDPOINT` (a full
//! manifest URL) replaces the channel's address, for testing; the installer
//! must still be signed with the key in `tauri.conf.json`.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, Url, Wry};
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_specta::Event;

use crate::settings::{UpdateChannel, UpdateSettings};
use crate::state::AppState;
use crate::{editor, output, session};

const MANIFESTS: &str = "https://raw.githubusercontent.com/rpodsada/vandal/update-manifests";
const ENDPOINT_ENV: &str = "VANDAL_UPDATE_ENDPOINT";
/// The relaunch after an update: starts quietly in the tray, like a login start.
pub const UPDATED_ARG: &str = "--updated";

const FIRST_CHECK: Duration = Duration::from_secs(60);
const CHECK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);
/// How often the scheduler looks at the clock. Wall-clock time, so a day spent
/// asleep still counts as a day.
const WAKE_EVERY: Duration = Duration::from_secs(60 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
/// How long an editor's "save first?" may stay unanswered.
const LEAVE_TIMEOUT: Duration = Duration::from_secs(10 * 60);

#[derive(Default)]
pub struct UpdaterState {
    available: Mutex<Option<Update>>,
    last_check: Mutex<Option<SystemTime>>,
    installing: AtomicBool,
    /// An editor stayed open when asked to leave for the update.
    editor_kept: AtomicBool,
}

/// An update that can be installed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    /// The release notes (the CHANGELOG section, Markdown).
    pub notes: String,
    /// When it was published (RFC 3339), if the manifest says.
    pub date: Option<String>,
}

impl From<&Update> for UpdateInfo {
    fn from(u: &Update) -> Self {
        Self {
            version: u.version.clone(),
            current_version: u.current_version.clone(),
            notes: u.body.clone().unwrap_or_default(),
            date: u.raw_json["pub_date"].as_str().map(str::to_string),
        }
    }
}

/// Rust → all windows: a newer version was found (not repeated for the same one).
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct UpdateAvailable(pub UpdateInfo);

/// Rust → all windows: the installer is downloading.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub downloaded: u32,
    pub total: Option<u32>,
}

/// Rust → editor windows: leave as closing would (`updateEditorKept` if not).
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct EditorLeaveForUpdate;

/// Startup: the state, and the daily checks (not in dev builds).
pub fn init(app: &AppHandle<Wry>) {
    app.manage(UpdaterState::default());
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            if check_due(&app) {
                if let Err(e) = tauri::async_runtime::block_on(check(&app)) {
                    eprintln!("[updates] check failed: {e}");
                }
            }
            std::thread::sleep(WAKE_EVERY);
        }
    });
}

fn check_due(app: &AppHandle<Wry>) -> bool {
    let on = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .updates
        .check_automatically;
    let last = *app.state::<UpdaterState>().last_check.lock().unwrap();
    on && last.is_none_or(|t| t.elapsed().map_or(true, |age| age >= CHECK_EVERY))
}

/// `settings::update`: turning checks on (or switching channel while they're
/// on) checks right away; a new channel forgets the other one's update.
pub fn settings_changed(app: &AppHandle<Wry>, old: &UpdateSettings, new: &UpdateSettings) {
    if old.channel != new.channel {
        *app.state::<UpdaterState>().available.lock().unwrap() = None;
    }
    let turned_on = new.check_automatically && !old.check_automatically;
    let switched = new.check_automatically && old.channel != new.channel;
    if (turned_on || switched) && !cfg!(debug_assertions) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = check(&app).await {
                eprintln!("[updates] check failed: {e}");
            }
        });
    }
}

fn endpoint(channel: UpdateChannel) -> Result<Url, String> {
    let url = match std::env::var(ENDPOINT_ENV) {
        Ok(url) => url,
        Err(_) if cfg!(debug_assertions) => {
            return Err(format!(
                "Dev builds don't update (set {ENDPOINT_ENV} to test)."
            ));
        }
        Err(_) => {
            let name = match channel {
                UpdateChannel::Beta => "beta",
                UpdateChannel::Stable => "stable",
            };
            format!("{MANIFESTS}/{name}.json")
        }
    };
    url.parse()
        .map_err(|e| format!("Bad update address {url}: {e}"))
}

/// Ask the channel's manifest for a newer version. Remembers what it finds
/// for [`install`], and announces a version it hadn't found before.
pub async fn check(app: &AppHandle<Wry>) -> Result<Option<UpdateInfo>, String> {
    let channel = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .updates
        .channel;
    let exit_app = app.clone();
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint(channel)?])
        .map_err(|e| e.to_string())?
        .timeout(REQUEST_TIMEOUT)
        // The plugin would relaunch with this run's arguments (`--edit`,
        // `--open-capture <temp file>`...); start quietly instead (3P.0).
        .restart_after_install(false)
        .installer_args(["/R", "/ARGS", UPDATED_ARG])
        // The plugin ends the app with `process::exit`, skipping RunEvent::Exit.
        .on_before_exit(move || before_exit(&exit_app))
        .build()
        .map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| e.to_string())?;

    let state = app.state::<UpdaterState>();
    *state.last_check.lock().unwrap() = Some(SystemTime::now());
    let info = found.as_ref().map(UpdateInfo::from);
    let previous = std::mem::replace(&mut *state.available.lock().unwrap(), found);
    if let Some(info) = &info {
        if previous.is_none_or(|p| p.version != info.version) {
            let _ = UpdateAvailable(info.clone()).emit(app);
        }
    }
    Ok(info)
}

/// The update found by the last check, if any.
pub fn available(app: &AppHandle<Wry>) -> Option<UpdateInfo> {
    app.state::<UpdaterState>()
        .available
        .lock()
        .unwrap()
        .as_ref()
        .map(UpdateInfo::from)
}

/// Download, verify and run the installer, then exit; the installer starts
/// the new version. Returns only if something stopped it.
pub async fn install(app: &AppHandle<Wry>) -> Result<(), String> {
    let state = app.state::<UpdaterState>();
    let update = state
        .available
        .lock()
        .unwrap()
        .clone()
        .ok_or("No update to install: check for updates first.")?;
    if state.installing.swap(true, Ordering::SeqCst) {
        return Err("The update is already installing.".into());
    }
    let result = install_inner(app, &update).await;
    state.installing.store(false, Ordering::SeqCst);
    result
}

async fn install_inner(app: &AppHandle<Wry>, update: &Update) -> Result<(), String> {
    ensure_no_capture(app)?;
    // Download first, so a failed download doesn't close anyone's editor.
    let mut downloaded: usize = 0;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk;
                let _ = UpdateProgress {
                    downloaded: u32::try_from(downloaded).unwrap_or(u32::MAX),
                    total: total.map(|t| u32::try_from(t).unwrap_or(u32::MAX)),
                }
                .emit(app);
            },
            || {},
        )
        .await
        .map_err(|e| format!("The download failed: {e}"))?;
    if !leave_editors(app).await {
        return Err("An editor is still open, so the update wasn't installed.".into());
    }
    ensure_no_capture(app)?;
    update
        .install(bytes)
        .map_err(|e| format!("The installer didn't start: {e}"))
}

fn ensure_no_capture(app: &AppHandle<Wry>) -> Result<(), String> {
    match session::current(app) {
        Some(_) => Err("Finish or cancel the capture first.".into()),
        None => Ok(()),
    }
}

fn editor_windows(app: &AppHandle<Wry>) -> usize {
    app.webview_windows()
        .keys()
        .filter(|label| editor::id_from_label(label).is_some())
        .count()
}

/// Ask every editor to leave (each runs its close flow, then destroys itself or
/// reports [`editor_kept`]); true once none is left.
async fn leave_editors(app: &AppHandle<Wry>) -> bool {
    if editor_windows(app) == 0 {
        return true;
    }
    app.state::<UpdaterState>()
        .editor_kept
        .store(false, Ordering::SeqCst);
    if EditorLeaveForUpdate.emit(app).is_err() {
        return false;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started = Instant::now();
        loop {
            if app
                .state::<UpdaterState>()
                .editor_kept
                .load(Ordering::SeqCst)
            {
                return false;
            }
            if editor_windows(&app) == 0 {
                return true;
            }
            if started.elapsed() > LEAVE_TIMEOUT {
                return false;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    })
    .await
    .unwrap_or(false)
}

/// An editor page chose to stay ("Cancel" in its "save first?").
pub fn editor_kept(app: &AppHandle<Wry>) {
    app.state::<UpdaterState>()
        .editor_kept
        .store(true, Ordering::SeqCst);
}

/// What `RunEvent::Exit` would do, plus taking the tray icon down (it would
/// linger until hovered).
fn before_exit(app: &AppHandle<Wry>) {
    output::delete_preview();
    crate::tray::remove(app);
}
