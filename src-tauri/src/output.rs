//! Post-capture actions: clipboard, save to file, toast (PLAN §4.2, Phase 1.5).

use std::collections::VecDeque;
use std::fs::File;
use std::io::BufWriter;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use tauri::{AppHandle, Manager};
use tauri_winrt_notification::Toast;
use windows::Win32::System::SystemInformation::GetLocalTime;

use crate::capture::MonitorFrame;
use crate::compose::RgbaImage;
use crate::frames::Capture;
use crate::geometry::PhysicalRect;
use crate::settings::{SaveSettings, Settings};
use crate::state::AppState;

/// The last few delivered images, so a notification's "Save" button can write
/// one after the fact without holding pixels in the toast callback, and its
/// "Edit" can reopen the capture still editable (PLAN 3D).
pub struct RecentImages {
    next_id: u32,
    items: VecDeque<(u32, Recent)>,
}

/// A delivered image and the document it came from.
#[derive(Clone)]
pub struct Recent {
    /// As delivered: cropped, markup flattened.
    pub image: Arc<RgbaImage>,
    pub doc: CaptureDoc,
}

/// What "Open in editor" would have opened (PLAN 3D.1). The frames are shared
/// with `FrameStore`, so they only cost memory once it has dropped them.
#[derive(Clone)]
pub struct CaptureDoc {
    /// The monitors the selection touched.
    pub frames: Vec<Arc<MonitorFrame>>,
    /// The selection, in virtual-desktop physical px.
    pub rect: PhysicalRect,
    /// Quick edit's annotations (JSON, virtual-desktop px), if it was used.
    pub annotations: Option<String>,
}

impl CaptureDoc {
    /// The frames of `capture` under `rect`.
    pub fn new(capture: &Capture, rect: PhysicalRect, annotations: Option<String>) -> Self {
        Self {
            frames: touched_frames(&capture.frames, rect),
            rect,
            annotations,
        }
    }
}

/// The frames whose monitor `rect` touches.
pub fn touched_frames(frames: &[Arc<MonitorFrame>], rect: PhysicalRect) -> Vec<Arc<MonitorFrame>> {
    frames
        .iter()
        .filter(|f| f.monitor.physical_bounds.intersect(&rect).is_some())
        .cloned()
        .collect()
}

impl RecentImages {
    const KEEP: usize = 5;

    pub fn new() -> Self {
        Self {
            next_id: 1,
            items: VecDeque::new(),
        }
    }

    pub fn push(&mut self, recent: Recent) -> u32 {
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1).max(1);
        self.items.push_back((id, recent));
        while self.items.len() > Self::KEEP {
            self.items.pop_front();
        }
        id
    }

    pub fn get(&self, id: u32) -> Option<Recent> {
        self.items
            .iter()
            .find(|(i, _)| *i == id)
            .map(|(_, recent)| recent.clone())
    }
}

/// What quick edit already did with this image, so delivering doesn't repeat it.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Already {
    pub copied: bool,
    pub saved: Option<PathBuf>,
}

/// Hand a finished capture to the configured actions. Returns immediately; the
/// work runs on a background thread so the overlay can disappear at once.
/// `doc` is what the notification's Edit reopens (PLAN 3D.1).
pub fn deliver(
    app: &AppHandle,
    image: RgbaImage,
    doc: CaptureDoc,
    started: Instant,
    already: Already,
) {
    let settings: Settings = app.state::<AppState>().settings.read().unwrap().clone();
    let app = app.clone();
    std::thread::spawn(move || {
        let image = Arc::new(image);
        let image_id = app
            .state::<AppState>()
            .recent_images
            .lock()
            .unwrap()
            .push(Recent {
                image: image.clone(),
                doc,
            });

        let copying = settings.after_capture.copy_to_clipboard && !already.copied;
        let copied = copying
            && match copy_to_clipboard(&image) {
                Ok(()) => true,
                Err(e) => {
                    eprintln!("[output] clipboard failed: {e}");
                    false
                }
            };
        if copied {
            eprintln!(
                "[perf] capture → clipboard {:.1}ms ({}×{})",
                started.elapsed().as_secs_f64() * 1000.0,
                image.width,
                image.height
            );
        }

        let copied = copied || already.copied;
        let saved = if already.saved.is_some() {
            already.saved
        } else if settings.after_capture.auto_save {
            match save_with_template(&settings.save, &image) {
                Ok(p) => Some(p),
                Err(e) => {
                    eprintln!("[output] save failed: {e}");
                    notify_error(&app, "Couldn't save screenshot", &e);
                    None
                }
            }
        } else {
            None
        };

        if !wants_notification(&settings, copied, saved.is_some()) {
            return;
        }
        let preview = saved.clone().or_else(|| write_preview(&image).ok());
        notify_capture(
            &app,
            CaptureToast {
                image_id,
                width: image.width,
                height: image.height,
                copied,
                saved,
                preview,
                offer_save: settings.save.notification_save_button,
                offer_edit: settings.editor.notification_edit_button,
            },
        );
    });
}

/// Whether a capture's notification shows (PLAN 3H.12): for a copy or a save
/// whose notification is on. One that was neither copied nor saved always
/// shows, as it's the way to save or edit it.
fn wants_notification(settings: &Settings, copied: bool, saved: bool) -> bool {
    let a = &settings.after_capture;
    (!copied && !saved) || (copied && a.notify_copied) || (saved && a.notify_saved)
}

/// The notification's "Save" button: write a recent capture with the current
/// save settings, then confirm with an "Open folder" notification.
fn save_recent(app: &AppHandle, image_id: u32) {
    let state = app.state::<AppState>();
    let Some(Recent { image, .. }) = state.recent_images.lock().unwrap().get(image_id) else {
        notify_error(app, "Couldn't save screenshot", "It's no longer in memory.");
        return;
    };
    let settings = state.settings.read().unwrap().clone();
    let save = settings.save;
    match save_with_template(&save, &image) {
        Ok(_) if !settings.after_capture.notify_saved => {}
        Ok(path) => notify_capture(
            app,
            CaptureToast {
                image_id,
                width: image.width,
                height: image.height,
                copied: false,
                preview: Some(path.clone()),
                saved: Some(path),
                offer_save: false,
                offer_edit: settings.editor.notification_edit_button,
            },
        ),
        Err(e) => notify_error(app, "Couldn't save screenshot", &e),
    }
}

// ---------- clipboard ----------

pub fn copy_to_clipboard(image: &RgbaImage) -> Result<(), String> {
    crate::clipboard::set_image(image)
}

/// The image on the clipboard ("New from clipboard").
pub fn paste_image() -> Result<RgbaImage, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let data = clipboard.get_image().map_err(|e| match e {
        arboard::Error::ContentNotAvailable => "The clipboard has no image.".to_string(),
        e => e.to_string(),
    })?;
    Ok(RgbaImage {
        width: data.width as u32,
        height: data.height as u32,
        rgba: data.bytes.into_owned(),
    })
}

// ---------- files ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Timestamp {
    pub year: u16,
    pub month: u16,
    pub day: u16,
    pub hour: u16,
    pub minute: u16,
    pub second: u16,
}

impl Timestamp {
    pub fn now_local() -> Self {
        let t = unsafe { GetLocalTime() };
        Self {
            year: t.wYear,
            month: t.wMonth,
            day: t.wDay,
            hour: t.wHour,
            minute: t.wMinute,
            second: t.wSecond,
        }
    }
}

/// Fill `{yyyy} {MM} {dd} {HH} {mm} {ss}` and make the result a valid file name.
pub fn render_template(template: &str, t: &Timestamp) -> String {
    let name = template
        .replace("{yyyy}", &format!("{:04}", t.year))
        .replace("{MM}", &format!("{:02}", t.month))
        .replace("{dd}", &format!("{:02}", t.day))
        .replace("{HH}", &format!("{:02}", t.hour))
        .replace("{mm}", &format!("{:02}", t.minute))
        .replace("{ss}", &format!("{:02}", t.second));
    sanitize_file_name(&name)
}

/// The file name (no extension) a save into `dir` gets now: the template with
/// the date and time filled in, and its auto number (`{n}`, PLAN 3H.8) one
/// more than the highest already in `dir`.
pub fn file_stem(dir: &Path, template: &str) -> String {
    let rendered = render_template(template, &Timestamp::now_local());
    if !rendered.contains("{n") {
        return rendered;
    }
    let names = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            path.file_stem().map(|s| s.to_string_lossy().into_owned())
        });
    number_stem(&rendered, names)
}

/// A piece of a rendered template: text, or an auto number of at least
/// this many digits (`{n}`, `{nn}`, `{nnn}`...).
#[derive(Debug, PartialEq)]
enum StemPart<'a> {
    Text(&'a str),
    Number(usize),
}

fn stem_parts(stem: &str) -> Vec<StemPart<'_>> {
    let mut parts = Vec::new();
    let mut rest = stem;
    while let Some(start) = rest.find("{n") {
        let digits = rest[start + 1..].bytes().take_while(|&b| b == b'n').count();
        if rest[start + 1 + digits..].starts_with('}') {
            if start > 0 {
                parts.push(StemPart::Text(&rest[..start]));
            }
            parts.push(StemPart::Number(digits));
            rest = &rest[start + digits + 2..];
        } else {
            // "{nope}": plain text.
            parts.push(StemPart::Text(&rest[..start + 2]));
            rest = &rest[start + 2..];
        }
    }
    if !rest.is_empty() {
        parts.push(StemPart::Text(rest));
    }
    parts
}

/// The number in `name` if it fits `parts` (letter case aside, as Windows
/// file names do): the first auto number's digits.
fn number_in(name: &str, parts: &[StemPart]) -> Option<u64> {
    let name = name.to_lowercase();
    let mut rest = name.as_str();
    let mut found = None;
    for part in parts {
        match part {
            StemPart::Text(text) => rest = rest.strip_prefix(text.to_lowercase().as_str())?,
            StemPart::Number(_) => {
                let len = rest.bytes().take_while(u8::is_ascii_digit).count();
                if len == 0 {
                    return None;
                }
                let n = rest[..len].parse().ok()?;
                found.get_or_insert(n);
                rest = &rest[len..];
            }
        }
    }
    rest.is_empty().then_some(found).flatten()
}

/// Fill a rendered template's auto numbers with one more than the highest
/// among `names` that fit it (1 if none do; gaps aren't refilled).
fn number_stem(rendered: &str, names: impl Iterator<Item = String>) -> String {
    let parts = stem_parts(rendered);
    let next = names
        .filter_map(|name| number_in(&name, &parts))
        .max()
        .map_or(1, |n| n.saturating_add(1));
    parts
        .iter()
        .map(|part| match part {
            StemPart::Text(text) => (*text).to_string(),
            StemPart::Number(width) => format!("{next:0width$}"),
        })
        .collect()
}

/// Replace characters Windows forbids in file names; never returns empty.
pub fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    // Windows strips trailing dots/spaces, which would change the name.
    let trimmed = cleaned.trim_start().trim_end_matches(['.', ' ']);
    if trimmed.is_empty() {
        "Screenshot".into()
    } else {
        trimmed.into()
    }
}

/// Expand `%NAME%` using `lookup`; unknown variables are left as-is.
pub fn expand_env(s: &str, lookup: impl Fn(&str) -> Option<String>) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) if end > 0 => {
                let name = &after[..end];
                match lookup(name) {
                    Some(v) => out.push_str(&v),
                    None => {
                        out.push('%');
                        out.push_str(name);
                        out.push('%');
                    }
                }
                rest = &after[end + 1..];
            }
            _ => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// Inverse of [`expand_env`] for one variable: `C:\Users\me\Pictures` →
/// `%USERPROFILE%\Pictures`, so stored paths survive a profile rename or move.
pub fn contract_env(path: &str, name: &str, value: &str) -> String {
    let value = value.trim_end_matches('\\');
    if value.is_empty() || path.len() < value.len() || !path.is_char_boundary(value.len()) {
        return path.to_string();
    }
    let (head, rest) = path.split_at(value.len());
    if head.eq_ignore_ascii_case(value) && (rest.is_empty() || rest.starts_with('\\')) {
        format!("%{name}%{rest}")
    } else {
        path.to_string()
    }
}

/// Expand env vars in a stored directory setting.
pub fn resolve_dir(dir: &str) -> PathBuf {
    PathBuf::from(expand_env(dir, |k| std::env::var(k).ok()))
}

/// `dir/stem.ext`, or `dir/stem (2).ext`, `(3)`… if taken.
pub fn unique_path(dir: &Path, stem: &str, ext: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if !exists(&first) {
        return first;
    }
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}).{ext}")))
        .find(|p| !exists(p))
        .expect("unbounded range")
}

pub fn save_with_template(save: &SaveSettings, image: &RgbaImage) -> Result<PathBuf, String> {
    let dir = resolve_dir(&save.directory);
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let stem = file_stem(&dir, &save.filename_template);
    let path = unique_path(&dir, &stem, "png", |p| p.exists());
    write_png(image, &path)?;
    Ok(path)
}

/// PNG with fast compression: saving must not feel slow.
pub fn write_png(image: &RgbaImage, path: &Path) -> Result<(), String> {
    let file = File::create(path).map_err(|e| format!("{}: {e}", path.display()))?;
    write_png_to(image, BufWriter::new(file))
}

/// [`write_png`] into any writer (the clipboard's PNG is made in memory).
pub fn write_png_to(image: &RgbaImage, out: impl std::io::Write) -> Result<(), String> {
    let mut encoder = png::Encoder::new(out, image.width, image.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Fast);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer
        .write_image_data(&image.rgba)
        .map_err(|e| e.to_string())?;
    writer.finish().map_err(|e| e.to_string())
}

/// A temp copy for the toast thumbnail when the capture wasn't saved.
fn write_preview(image: &RgbaImage) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("vandal");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("last-capture.png");
    write_png(image, &path)?;
    Ok(path)
}

pub fn reveal_in_explorer(path: &Path) {
    let _ = std::process::Command::new("explorer.exe")
        .raw_arg(format!("/select,\"{}\"", path.display()))
        .spawn();
}

// ---------- notifications ----------

/// Unpackaged dev builds have no registered AppUserModelID, so borrow
/// PowerShell's; the installer registers ours (the bundle identifier).
fn app_id(app: &AppHandle) -> String {
    if cfg!(debug_assertions) {
        Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

struct CaptureToast {
    image_id: u32,
    width: u32,
    height: u32,
    copied: bool,
    saved: Option<PathBuf>,
    preview: Option<PathBuf>,
    /// Show a "Save" button (only meaningful when not already saved).
    offer_save: bool,
    /// Show an "Edit" button (the toast body opens the editor regardless).
    offer_edit: bool,
}

fn notify_capture(app: &AppHandle, t: CaptureToast) {
    let title = match (t.copied, t.saved.is_some()) {
        (true, true) => "Screenshot copied and saved",
        (true, false) => "Screenshot copied to clipboard",
        (false, true) => "Screenshot saved",
        (false, false) => "Screenshot captured",
    };
    let mut detail = format!("{} × {}", t.width, t.height);
    if let Some(p) = t.saved.as_deref().and_then(|p| p.file_name()) {
        detail.push_str(&format!(" · {}", p.to_string_lossy()));
    }

    let mut toast = Toast::new(&app_id(app))
        .title(title)
        .text1(&detail)
        .sound(None);
    if let Some(p) = &t.preview {
        toast = toast.image(p, "Capture preview");
    }
    if t.offer_edit {
        toast = toast.add_button("Edit", "edit");
    }
    if t.saved.is_some() {
        toast = toast.add_button("Open folder", "open-folder");
    } else if t.offer_save {
        toast = toast.add_button("Save", "save");
    }
    let app = app.clone();
    let (image_id, saved) = (t.image_id, t.saved);
    toast = toast.on_activated(move |action| {
        match action.as_deref() {
            // A click on the toast body (thumbnail included) edits, like the button.
            None | Some("edit") => crate::editor::open_recent(&app, image_id),
            Some("save") => save_recent(&app, image_id),
            Some("open-folder") => {
                if let Some(path) = &saved {
                    reveal_in_explorer(path);
                }
            }
            Some(other) => eprintln!("[output] unknown toast action {other:?}"),
        }
        Ok(())
    });
    if let Err(e) = toast.show() {
        eprintln!("[output] toast failed: {e}");
    }
}

pub fn notify_error(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = Toast::new(&app_id(app)).title(title).text1(body).show() {
        eprintln!("[output] toast failed: {e} ({title}: {body})");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notifications_follow_their_switches() {
        let mut s = Settings::default();
        let shows = |s: &Settings, copied, saved| wants_notification(s, copied, saved);
        assert!(shows(&s, true, false) && shows(&s, false, true) && shows(&s, true, true));
        s.after_capture.notify_copied = false;
        assert!(!shows(&s, true, false));
        assert!(shows(&s, true, true), "the save's notification is still on");
        s.after_capture.notify_saved = false;
        assert!(!shows(&s, true, true) && !shows(&s, false, true));
        assert!(
            shows(&s, false, false),
            "neither: always, to save or edit it"
        );
    }

    const T: Timestamp = Timestamp {
        year: 2026,
        month: 9,
        day: 6,
        hour: 7,
        minute: 5,
        second: 3,
    };

    #[test]
    fn renders_default_template_with_padding() {
        assert_eq!(
            render_template("Screenshot {yyyy}-{MM}-{dd} {HH}-{mm}-{ss}", &T),
            "Screenshot 2026-09-06 07-05-03"
        );
    }

    #[test]
    fn repeated_and_unknown_tokens() {
        assert_eq!(render_template("{dd}{dd} {foo}", &T), "0606 {foo}");
    }

    #[test]
    fn template_output_is_sanitized() {
        assert_eq!(render_template("a/b\\c:{HH}:{mm}?", &T), "a-b-c-07-05-");
        assert_eq!(render_template("shot. . ", &T), "shot");
        assert_eq!(render_template("   ", &T), "Screenshot");
        assert_eq!(sanitize_file_name("a\u{0007}b"), "a-b");
    }

    #[test]
    fn expands_env_vars() {
        let lookup = |k: &str| match k {
            "USERPROFILE" => Some(r"C:\Users\Rich".to_string()),
            "EMPTY" => Some(String::new()),
            _ => None,
        };
        assert_eq!(
            expand_env(r"%USERPROFILE%\Pictures\Screenshots", lookup),
            r"C:\Users\Rich\Pictures\Screenshots"
        );
        assert_eq!(expand_env("%NOPE%/x", lookup), "%NOPE%/x");
        assert_eq!(expand_env("a%EMPTY%b", lookup), "ab");
        assert_eq!(expand_env("100% sure", lookup), "100% sure");
        assert_eq!(expand_env("%%", lookup), "%%");
        assert_eq!(expand_env("no vars", lookup), "no vars");
    }

    #[test]
    fn contracts_profile_prefix() {
        let home = r"C:\Users\Rich";
        assert_eq!(
            contract_env(r"C:\Users\Rich\Pictures\Shots", "USERPROFILE", home),
            r"%USERPROFILE%\Pictures\Shots"
        );
        assert_eq!(
            contract_env(r"c:\users\rich", "USERPROFILE", home),
            "%USERPROFILE%"
        );
        // Not a path-component boundary.
        assert_eq!(
            contract_env(r"C:\Users\Richard\x", "USERPROFILE", home),
            r"C:\Users\Richard\x"
        );
        assert_eq!(contract_env(r"D:\Shots", "USERPROFILE", home), r"D:\Shots");
        assert_eq!(contract_env(r"C:\x", "USERPROFILE", ""), r"C:\x");
        // Round-trips through expand_env.
        let stored = contract_env(r"C:\Users\Rich\Pictures", "USERPROFILE", home);
        assert_eq!(
            expand_env(&stored, |_| Some(home.to_string())),
            r"C:\Users\Rich\Pictures"
        );
    }

    #[test]
    fn recent_images_keeps_last_few() {
        let img = || Recent {
            image: Arc::new(RgbaImage {
                width: 1,
                height: 1,
                rgba: vec![0; 4],
            }),
            doc: CaptureDoc {
                frames: vec![],
                rect: PhysicalRect::new(0, 0, 1, 1),
                annotations: None,
            },
        };
        let mut recent = RecentImages::new();
        let ids: Vec<u32> = (0..7).map(|_| recent.push(img())).collect();
        assert!(recent.get(ids[0]).is_none());
        assert!(recent.get(ids[1]).is_none());
        assert!(recent.get(ids[2]).is_some());
        assert!(recent.get(ids[6]).is_some());
    }

    #[test]
    fn capture_doc_keeps_only_touched_monitors() {
        use crate::geometry::MonitorInfo;
        let frame = |index: u32, x: i32| {
            let bounds = PhysicalRect::new(x, 0, 100, 100);
            Arc::new(MonitorFrame {
                monitor: MonitorInfo {
                    index,
                    name: String::new(),
                    physical_bounds: bounds,
                    work_area: bounds,
                    scale_factor: 1.0,
                    is_primary: index == 0,
                },
                width: 100,
                height: 100,
                bgra: vec![],
                has_alpha: false,
            })
        };
        // Left monitor at negative x, then primary, then right.
        let frames = vec![frame(1, -100), frame(0, 0), frame(2, 100)];
        let indices = |rect| -> Vec<u32> {
            touched_frames(&frames, rect)
                .iter()
                .map(|f| f.monitor.index)
                .collect()
        };
        assert_eq!(indices(PhysicalRect::new(10, 10, 20, 20)), [0]);
        assert_eq!(indices(PhysicalRect::new(-20, 10, 40, 20)), [1, 0]);
        assert_eq!(indices(PhysicalRect::new(-100, 0, 300, 100)), [1, 0, 2]);
        // Shared, not copied.
        let touched = touched_frames(&frames, PhysicalRect::new(10, 10, 20, 20));
        assert!(Arc::ptr_eq(&touched[0], &frames[1]));
    }

    #[test]
    fn auto_number_counts_up_from_the_highest() {
        let names = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let next = |stem: &str, list: &[&str]| number_stem(stem, names(list).into_iter());
        assert_eq!(next("screenshot-{n}", &[]), "screenshot-1");
        assert_eq!(next("screenshot-{n}", &["screenshot-1"]), "screenshot-2");
        // Gaps stay: with 1 and 3 there, the next is 4.
        assert_eq!(
            next("screenshot-{n}", &["screenshot-1", "Screenshot-3"]),
            "screenshot-4"
        );
        // Other names, and near misses, don't count.
        assert_eq!(
            next(
                "shot {n}",
                &["shot 7 (2)", "shot x", "shot ", "other 9", "shot 2"]
            ),
            "shot 3"
        );
    }

    #[test]
    fn auto_number_pads_to_its_ns() {
        let next =
            |stem: &str, list: &[&str]| number_stem(stem, list.iter().map(|s| s.to_string()));
        assert_eq!(next("img {nnn}", &[]), "img 001");
        assert_eq!(next("img {nnn}", &["img 009"]), "img 010");
        // Padding is a minimum, and unpadded names count too.
        assert_eq!(next("img {nn}", &["img 99"]), "img 100");
        assert_eq!(next("img {nn}", &["img 5"]), "img 06");
        // The date is part of the match, so a dated template restarts daily.
        assert_eq!(
            next("2026-10-01 {n}", &["2026-09-30 4", "2026-10-01 2"]),
            "2026-10-01 3"
        );
        // Not an auto number.
        assert_eq!(next("{nope} {n}", &["{nope} 1"]), "{nope} 2");
    }

    #[test]
    fn unique_path_appends_counter() {
        let dir = Path::new(r"C:\shots");
        let taken = [dir.join("s.png"), dir.join("s (2).png")];
        let p = unique_path(dir, "s", "png", |p| taken.iter().any(|t| t == p));
        assert_eq!(p, dir.join("s (3).png"));
        assert_eq!(
            unique_path(dir, "new", "png", |_| false),
            dir.join("new.png")
        );
    }

    #[test]
    fn png_round_trip() {
        let image = RgbaImage {
            width: 2,
            height: 1,
            rgba: vec![255, 0, 0, 255, 0, 0, 255, 128],
        };
        let dir = std::env::temp_dir().join("vandal-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("rt.png");
        write_png(&image, &path).unwrap();
        let decoder = png::Decoder::new(std::io::BufReader::new(File::open(&path).unwrap()));
        let mut reader = decoder.read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut buf).unwrap();
        assert_eq!((info.width, info.height), (2, 1));
        assert_eq!(&buf[..8], &image.rgba[..]);
    }
}
