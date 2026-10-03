//! The browser extension's native messaging host (PLAN 3N.7). Chrome and Edge
//! launch `vandal.exe` with the extension's origin as an argument and talk to
//! it over stdin/stdout: each message is a little-endian u32 length and that
//! many bytes of JSON. We handle it before Tauri starts, so the host is the
//! app's own exe and nothing else needs installing or signing.
//!
//! The extension sends `hello` (we answer with our name and version), or a
//! capture as `begin`, any number of `chunk`s (base64 PNG data) and `end`. On
//! `end` the PNG goes to a temp file, with the page title beside it in a
//! `.json` file, and `vandal.exe --open-capture <file>` opens it in the running
//! app (single-instance), or starts it. The title doesn't go on the command
//! line: single-instance forwards arguments joined with `|`, which titles often
//! contain ("Page | Site"). Everything but the file and process work is pure,
//! so it's tested here.

use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

/// The extensions allowed to use the host; the host manifest's
/// `allowed_origins` says the same, and the browser enforces it.
const ALLOWED_ORIGINS: &[&str] = &["chrome-extension://bmloooliddgohojbpadiljacckgdbngm/"];
/// Chrome caps a message to a host at 64 MiB.
const MAX_MESSAGE: usize = 64 * 1024 * 1024;
/// The largest capture we accept: a full page at the 65,000 px cap is far less.
const MAX_IMAGE: usize = 512 * 1024 * 1024;
/// Page titles are cut to this many characters for the window title.
const MAX_TITLE: usize = 200;
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// The extension's origin if the browser launched us as its native host.
pub fn browser_origin(args: &[String]) -> Option<&str> {
    args.iter()
        .skip(1)
        .map(String::as_str)
        .find(|a| a.starts_with("chrome-extension://"))
}

/// Serve the browser until it closes our stdin.
pub fn run(origin: &str) {
    if !ALLOWED_ORIGINS.contains(&origin) {
        return;
    }
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut input = stdin.lock();
    let mut output = stdout.lock();
    // A dev build loads its UI from the Vite dev server, so starting one
    // outside `tauri dev` gives windows (full-screen overlays included) with no
    // UI and no way to close them: a dev host only hands over to a running app.
    let available = !cfg!(debug_assertions) || dev_app_running();
    let mut transfer = Transfer::new(available);
    loop {
        let message = match read_message(&mut input) {
            Ok(Some(message)) => message,
            Ok(None) => break,
            Err(e) => {
                let _ = write_message(&mut output, &error(&e.to_string()));
                break;
            }
        };
        let reply = match transfer.handle(&message) {
            Ok(Step::Reply(reply)) => Some(reply),
            Ok(Step::Wait) => None,
            Ok(Step::Done(capture)) => Some(match open_capture(&capture) {
                Ok(()) => json!({ "ok": true }),
                Err(e) => error(&e),
            }),
            Err(e) => Some(error(&e)),
        };
        if let Some(reply) = reply {
            if write_message(&mut output, &reply).is_err() {
                break;
            }
        }
    }
}

fn error(message: &str) -> Value {
    json!({ "ok": false, "error": message })
}

/// One message, or `None` at a clean end of input.
pub fn read_message(r: &mut impl Read) -> io::Result<Option<Vec<u8>>> {
    let mut len = [0u8; 4];
    match r.read_exact(&mut len) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_le_bytes(len) as usize;
    if len > MAX_MESSAGE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "message too large",
        ));
    }
    let mut message = vec![0; len];
    r.read_exact(&mut message)?;
    Ok(Some(message))
}

pub fn write_message(w: &mut impl Write, value: &Value) -> io::Result<()> {
    let bytes = serde_json::to_vec(value)?;
    w.write_all(&(bytes.len() as u32).to_le_bytes())?;
    w.write_all(&bytes)?;
    w.flush()
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Incoming {
    Hello,
    Begin {
        #[serde(default)]
        title: String,
    },
    Chunk {
        data: String,
    },
    End,
}

/// A capture received in full.
#[derive(Debug, PartialEq)]
pub struct Received {
    pub png: Vec<u8>,
    pub title: String,
}

pub enum Step {
    Reply(Value),
    /// Part of a transfer; nothing to say yet.
    Wait,
    Done(Received),
}

/// The state of a capture coming in, between `begin` and `end`.
pub struct Transfer {
    current: Option<Received>,
    /// Whether a capture can be handed over: false for a dev build that isn't
    /// running (see [`run`]).
    available: bool,
}

/// Why a dev host refuses: shown in the extension's result tab.
const DEV_NOT_RUNNING: &str = "Vandal Dev isn't running. Start it with npm run tauri:dev.";

impl Transfer {
    pub fn new(available: bool) -> Self {
        Self {
            current: None,
            available,
        }
    }

    pub fn handle(&mut self, message: &[u8]) -> Result<Step, String> {
        let incoming: Incoming =
            serde_json::from_slice(message).map_err(|e| format!("bad message: {e}"))?;
        match incoming {
            Incoming::Hello if !self.available => Err(DEV_NOT_RUNNING.into()),
            Incoming::Hello => Ok(Step::Reply(json!({
                "ok": true,
                "name": product_name(),
                "version": env!("CARGO_PKG_VERSION"),
            }))),
            Incoming::Begin { title } => {
                self.current = Some(Received {
                    png: Vec::new(),
                    title: clean_title(&title),
                });
                Ok(Step::Wait)
            }
            Incoming::Chunk { data } => {
                let current = self.current.as_mut().ok_or("chunk before begin")?;
                let bytes = decode_base64(&data).ok_or("bad image data")?;
                if current.png.len() + bytes.len() > MAX_IMAGE {
                    self.current = None;
                    return Err("the image is too large".into());
                }
                current.png.extend_from_slice(&bytes);
                Ok(Step::Wait)
            }
            Incoming::End => {
                let received = self.current.take().ok_or("end before begin")?;
                if !received.png.starts_with(PNG_SIGNATURE) {
                    return Err("not a PNG image".into());
                }
                if !self.available {
                    return Err(DEV_NOT_RUNNING.into());
                }
                Ok(Step::Done(received))
            }
        }
    }
}

/// The name the extension shows ("Connected to Vandal Dev 0.3.0…").
fn product_name() -> &'static str {
    if cfg!(debug_assertions) {
        "Vandal Dev"
    } else {
        "Vandal"
    }
}

/// Whether Vandal Dev is running: its single-instance lock exists (the
/// plugin's `<identifier>-sim` mutex). No window messages, so it works even
/// where those can't reach the app.
fn dev_app_running() -> bool {
    use windows::core::w;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenMutexW, SYNCHRONIZATION_SYNCHRONIZE};
    match unsafe {
        OpenMutexW(
            SYNCHRONIZATION_SYNCHRONIZE,
            false,
            w!("com.vandal.desktop.dev-sim"),
        )
    } {
        Ok(handle) => {
            unsafe {
                let _ = CloseHandle(handle);
            }
            true
        }
        Err(_) => false,
    }
}

/// A page title fit for a window title: one line, at most [`MAX_TITLE`] characters.
pub fn clean_title(title: &str) -> String {
    let one_line: String = title
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let words: Vec<&str> = one_line.split_whitespace().collect();
    words.join(" ").chars().take(MAX_TITLE).collect()
}

/// Standard base64 (with or without padding); `None` if it isn't.
pub fn decode_base64(text: &str) -> Option<Vec<u8>> {
    fn value(c: u8) -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32)
    }
    let bytes = text.trim_end_matches('=').as_bytes();
    if bytes.len() % 4 == 1 {
        return None;
    }
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    for group in bytes.chunks(4) {
        let mut n = 0u32;
        for (i, &c) in group.iter().enumerate() {
            n |= value(c)? << (18 - 6 * i);
        }
        out.push((n >> 16) as u8);
        if group.len() > 2 {
            out.push((n >> 8) as u8);
        }
        if group.len() > 3 {
            out.push(n as u8);
        }
    }
    Some(out)
}

/// The files of `--open-capture <file>` arguments (any number): browser
/// captures for the editor (PLAN 3N.7).
pub fn open_capture_args(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if arg == "--open-capture" {
            if let Some(path) = args.next() {
                found.push(cwd.join(path));
            }
        }
    }
    found
}

/// The page title the host left beside a capture, deleting that file.
pub fn take_title(capture: &Path) -> Option<String> {
    let sidecar = capture.with_extension("json");
    let text = std::fs::read_to_string(&sidecar).ok()?;
    let _ = std::fs::remove_file(&sidecar);
    title_from_json(&text)
}

fn title_from_json(text: &str) -> Option<String> {
    let value: Value = serde_json::from_str(text).ok()?;
    let title = clean_title(value.get("title")?.as_str()?);
    (!title.is_empty()).then_some(title)
}

/// Where browser captures wait for the app to pick them up.
fn temp_dir() -> PathBuf {
    std::env::temp_dir().join("vandal").join("browser")
}

/// Delete what an earlier transfer left behind (the app wasn't reached, or
/// couldn't delete it): anything over a day old.
fn delete_stale(dir: &Path) {
    let day = std::time::Duration::from_secs(24 * 60 * 60);
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|age| age > day);
        if old {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Write the PNG to a temp file and hand it to the app.
fn open_capture(capture: &Received) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::time::{SystemTime, UNIX_EPOCH};
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const DETACHED_PROCESS: u32 = 0x0000_0008;

    let dir = temp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    delete_stale(&dir);
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let file = dir.join(format!("{stamp}-{}.png", std::process::id()));
    std::fs::write(&file, &capture.png).map_err(|e| format!("{}: {e}", file.display()))?;
    let sidecar = file.with_extension("json");
    let title = json!({ "title": capture.title }).to_string();
    std::fs::write(&sidecar, title).map_err(|e| format!("{}: {e}", sidecar.display()))?;

    // We were started by the browser, which is in the foreground: let the app
    // bring its editor to the front.
    unsafe {
        let _ = windows::Win32::UI::WindowsAndMessaging::AllowSetForegroundWindow(
            windows::Win32::UI::WindowsAndMessaging::ASFW_ANY,
        );
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Command::new(exe)
        .arg("--open-capture")
        .arg(&file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("couldn't start Vandal: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn message(value: Value) -> Vec<u8> {
        serde_json::to_vec(&value).unwrap()
    }

    fn reply(step: Step) -> Value {
        match step {
            Step::Reply(v) => v,
            _ => panic!("expected a reply"),
        }
    }

    #[test]
    fn spots_a_browser_launch() {
        let launch = args(&[
            "vandal.exe",
            "chrome-extension://bmloooliddgohojbpadiljacckgdbngm/",
            "--parent-window=0",
        ]);
        assert_eq!(
            browser_origin(&launch),
            Some("chrome-extension://bmloooliddgohojbpadiljacckgdbngm/")
        );
        assert_eq!(browser_origin(&args(&["vandal.exe", "--settings"])), None);
    }

    #[test]
    fn frames_messages_both_ways() {
        let mut buf = Vec::new();
        write_message(&mut buf, &json!({ "ok": true })).unwrap();
        assert_eq!(&buf[..4], &11u32.to_le_bytes());
        let mut r = buf.as_slice();
        assert_eq!(read_message(&mut r).unwrap().unwrap(), br#"{"ok":true}"#);
        assert_eq!(read_message(&mut r).unwrap(), None);
    }

    #[test]
    fn refuses_huge_messages() {
        let mut r: &[u8] = &(MAX_MESSAGE as u32 + 1).to_le_bytes();
        assert!(read_message(&mut r).is_err());
    }

    #[test]
    fn says_hello() {
        let hello = reply(
            Transfer::new(true)
                .handle(&message(json!({ "type": "hello" })))
                .unwrap(),
        );
        assert_eq!(hello["ok"], true);
        assert_eq!(hello["version"], env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn receives_a_capture_in_chunks() {
        let mut t = Transfer::new(true);
        let png = [PNG_SIGNATURE, b"rest of it"].concat();
        let b64 = "iVBORw0KGgpyZXN0IG9mIGl0"; // the bytes above
        let (a, b) = b64.split_at(8);
        assert!(matches!(
            t.handle(&message(json!({ "type": "begin", "title": "A\tpage\n" })))
                .unwrap(),
            Step::Wait
        ));
        t.handle(&message(json!({ "type": "chunk", "data": a })))
            .unwrap();
        t.handle(&message(json!({ "type": "chunk", "data": b })))
            .unwrap();
        match t.handle(&message(json!({ "type": "end" }))).unwrap() {
            Step::Done(received) => assert_eq!(
                received,
                Received {
                    png,
                    title: "A page".into()
                }
            ),
            _ => panic!("expected the capture"),
        }
    }

    #[test]
    fn a_dev_host_without_its_app_refuses() {
        let mut t = Transfer::new(false);
        assert!(t.handle(&message(json!({ "type": "hello" }))).is_err());
        t.handle(&message(json!({ "type": "begin" }))).unwrap();
        t.handle(&message(json!({ "type": "chunk", "data": "iVBORw0KGgo=" })))
            .unwrap();
        assert_eq!(
            t.handle(&message(json!({ "type": "end" })))
                .err()
                .as_deref(),
            Some(DEV_NOT_RUNNING)
        );
    }

    #[test]
    fn refuses_what_isnt_a_png() {
        let mut t = Transfer::new(true);
        t.handle(&message(json!({ "type": "begin" }))).unwrap();
        t.handle(&message(json!({ "type": "chunk", "data": "aGVsbG8=" })))
            .unwrap();
        assert!(t.handle(&message(json!({ "type": "end" }))).is_err());
    }

    #[test]
    fn refuses_out_of_order_and_bad_messages() {
        let mut t = Transfer::new(true);
        assert!(t
            .handle(&message(json!({ "type": "chunk", "data": "" })))
            .is_err());
        assert!(t.handle(&message(json!({ "type": "end" }))).is_err());
        assert!(t.handle(b"not json").is_err());
        assert!(t.handle(&message(json!({ "type": "nope" }))).is_err());
    }

    #[test]
    fn decodes_base64() {
        assert_eq!(decode_base64("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(decode_base64("aGVsbG8").unwrap(), b"hello");
        assert_eq!(decode_base64("aGk=").unwrap(), b"hi");
        assert_eq!(decode_base64("").unwrap(), b"");
        assert!(decode_base64("a").is_none());
        assert!(decode_base64("a$==").is_none());
    }

    #[test]
    fn cleans_titles() {
        assert_eq!(clean_title("  Two\r\nlines\t "), "Two lines");
        assert_eq!(clean_title(&"x".repeat(300)).len(), MAX_TITLE);
    }

    #[test]
    fn parses_open_capture_args() {
        let cwd = Path::new(r"C:\work");
        let got = open_capture_args(
            &args(&[
                "vandal.exe",
                "--open-capture",
                r"C:\t\a.png",
                "--open-capture",
                "b.png",
                "--open-capture",
            ]),
            cwd,
        );
        assert_eq!(
            got,
            [
                PathBuf::from(r"C:\t\a.png"),
                PathBuf::from(r"C:\work\b.png")
            ]
        );
    }

    #[test]
    fn reads_the_title_beside_a_capture() {
        assert_eq!(
            title_from_json(r#"{"title":"Page | Site"}"#),
            Some("Page | Site".to_string())
        );
        assert_eq!(title_from_json(r#"{"title":"  "}"#), None);
        assert_eq!(title_from_json("not json"), None);
    }
}
