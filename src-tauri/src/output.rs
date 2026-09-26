//! Post-capture actions: clipboard, save to file, toast (PLAN §4.2, Phase 1.5).

use std::borrow::Cow;
use std::fs::File;
use std::io::BufWriter;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::time::Instant;

use tauri::{AppHandle, Manager};
use tauri_winrt_notification::Toast;
use windows::Win32::System::SystemInformation::GetLocalTime;

use crate::compose::RgbaImage;
use crate::settings::{SaveSettings, Settings};
use crate::state::AppState;

/// Hand a finished capture to the configured actions. Returns immediately; the
/// work runs on a background thread so the overlay can disappear at once.
pub fn deliver(app: &AppHandle, image: RgbaImage, started: Instant) {
    let settings: Settings = app.state::<AppState>().settings.read().unwrap().clone();
    let app = app.clone();
    std::thread::spawn(move || {
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
        notify_capture(&app, &image, copied, saved.as_deref(), preview.as_deref());
    });
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
    let dir = PathBuf::from(expand_env(&save.directory, |k| std::env::var(k).ok()));
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

fn notify_capture(
    app: &AppHandle,
    image: &RgbaImage,
    copied: bool,
    saved: Option<&Path>,
    preview: Option<&Path>,
) {
    let title = match (copied, saved.is_some()) {
        (true, true) => "Screenshot copied and saved",
        (true, false) => "Screenshot copied to clipboard",
        (false, true) => "Screenshot saved",
        (false, false) => "Screenshot captured",
    };
    let mut detail = format!("{} × {}", image.width, image.height);
    if let Some(p) = saved.and_then(|p| p.file_name()) {
        detail.push_str(&format!(" · {}", p.to_string_lossy()));
    }

    let mut toast = Toast::new(&app_id(app))
        .title(title)
        .text1(&detail)
        .sound(None);
    if let Some(p) = preview {
        toast = toast.image(p, "Capture preview");
    }
    if let Some(path) = saved {
        let path = path.to_path_buf();
        toast = toast
            .add_button("Open folder", "open-folder")
            .on_activated(move |_action| {
                // Button or toast body: both reveal the file.
                reveal_in_explorer(&path);
                Ok(())
            });
    }
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
