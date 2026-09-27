//! Post-capture actions: clipboard, save to file, toast (PLAN §4.2, Phase 1.5).

use std::borrow::Cow;
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

use crate::compose::RgbaImage;
use crate::settings::{SaveSettings, Settings};
use crate::state::AppState;

/// The last few delivered images, so a notification's "Save" button can write
/// one after the fact without holding pixels in the toast callback.
pub struct RecentImages {
    next_id: u32,
    items: VecDeque<(u32, Arc<RgbaImage>)>,
}

impl RecentImages {
    const KEEP: usize = 5;

    pub fn new() -> Self {
        Self {
            next_id: 1,
            items: VecDeque::new(),
        }
    }

    pub fn push(&mut self, image: Arc<RgbaImage>) -> u32 {
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1).max(1);
        self.items.push_back((id, image));
        while self.items.len() > Self::KEEP {
            self.items.pop_front();
        }
        id
    }

    pub fn get(&self, id: u32) -> Option<Arc<RgbaImage>> {
        self.items
            .iter()
            .find(|(i, _)| *i == id)
            .map(|(_, img)| img.clone())
    }
}

/// Hand a finished capture to the configured actions. Returns immediately; the
/// work runs on a background thread so the overlay can disappear at once.
pub fn deliver(app: &AppHandle, image: RgbaImage, started: Instant) {
    let settings: Settings = app.state::<AppState>().settings.read().unwrap().clone();
    let app = app.clone();
    std::thread::spawn(move || {
        let image = Arc::new(image);
        let image_id = app
            .state::<AppState>()
            .recent_images
            .lock()
            .unwrap()
            .push(image.clone());

        let copied = settings.after_capture.copy_to_clipboard
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

        let saved = if settings.after_capture.auto_save {
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
            },
        );
    });
}

/// The notification's "Save" button: write a recent capture with the current
/// save settings, then confirm with an "Open folder" notification.
fn save_recent(app: &AppHandle, image_id: u32) {
    let state = app.state::<AppState>();
    let Some(image) = state.recent_images.lock().unwrap().get(image_id) else {
        notify_error(app, "Couldn't save screenshot", "It's no longer in memory.");
        return;
    };
    let save = state.settings.read().unwrap().save.clone();
    match save_with_template(&save, &image) {
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
            },
        ),
        Err(e) => notify_error(app, "Couldn't save screenshot", &e),
    }
}

// ---------- clipboard ----------

pub fn copy_to_clipboard(image: &RgbaImage) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_image(arboard::ImageData {
            width: image.width as usize,
            height: image.height as usize,
            bytes: Cow::Borrowed(&image.rgba),
        })
        .map_err(|e| e.to_string())
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
    let stem = render_template(&save.filename_template, &Timestamp::now_local());
    let path = unique_path(&dir, &stem, "png", |p| p.exists());
    write_png(image, &path)?;
    Ok(path)
}

/// PNG with fast compression: saving must not feel slow.
pub fn write_png(image: &RgbaImage, path: &Path) -> Result<(), String> {
    let file = File::create(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut encoder = png::Encoder::new(BufWriter::new(file), image.width, image.height);
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
    let dir = std::env::temp_dir().join("capture-app");
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
    toast = toast.add_button("Edit", "edit");
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
        let img = || {
            Arc::new(RgbaImage {
                width: 1,
                height: 1,
                rgba: vec![0; 4],
            })
        };
        let mut recent = RecentImages::new();
        let ids: Vec<u32> = (0..7).map(|_| recent.push(img())).collect();
        assert!(recent.get(ids[0]).is_none());
        assert!(recent.get(ids[1]).is_none());
        assert!(recent.get(ids[2]).is_some());
        assert!(recent.get(ids[6]).is_some());
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
        let dir = std::env::temp_dir().join("capture-app-test");
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
