//! The Windows side of scrolling capture (PLAN 3K.3): find the scrolling area
//! with UI Automation, scroll it, and watch it with Windows.Graphics.Capture.
//!
//! From the 3K.0 spike: UI Automation's `ScrollPattern` is offered by Chrome,
//! Edge, WebView2, Explorer and WinUI apps. Setting the scroll percent jumps
//! with no smooth-scroll animation, says when it's at the bottom, and always
//! moves the right element. Firefox has no `ScrollPattern`, but its page is a
//! UIA `Document` whose rect is the viewport; it gets mouse-wheel messages
//! posted to its window (the pointer doesn't move). WinUI ignores posted
//! wheels, but has the pattern.
//!
//! Finding the area under the overlay (3K.4): see [`Finder::find`]. Only in
//! apps it was tested in ([`SUPPORTED`]): elsewhere scroll areas often
//! aren't exposed (VS Code's panes, Windows Terminal) or accessibility is
//! off (LibreWolf), and a guess scrolls and stitches badly.

use std::time::Duration;

use windows::Win32::Foundation::CloseHandle;
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationCacheRequest, IUIAutomationCondition,
    IUIAutomationElement, IUIAutomationScrollPattern, TreeScope_Children,
    UIA_BoundingRectanglePropertyId, UIA_ControlTypePropertyId, UIA_DocumentControlTypeId,
    UIA_FrameworkIdPropertyId, UIA_ScrollPatternId, UIA_ScrollPatternNoScroll,
    UIA_ScrollVerticalViewSizePropertyId, UIA_ScrollVerticallyScrollablePropertyId,
};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    ChildWindowFromPointEx, GetAncestor, GetWindowThreadProcessId, PostMessageW, WindowFromPoint,
    CWP_SKIPDISABLED, CWP_SKIPINVISIBLE, CWP_SKIPTRANSPARENT, GA_ROOT, WHEEL_DELTA, WM_MOUSEWHEEL,
};

use super::stitch::Image;
use super::{Frames, Scroller};
use crate::capture::WindowStream;
use crate::geometry::PhysicalRect;

/// The apps scrolling capture is offered in, by program file (lowercase):
/// tested in 3K.4 (Richard, 2026-10-02). Add one only after testing it.
pub const SUPPORTED: &[&str] = &[
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "explorer.exe",
    "notepad.exe",
    "systemsettings.exe",
    "vandal.exe",
];

/// For the overlay: where it works.
pub const SUPPORTED_NAMES: &str =
    "Chrome, Edge, Firefox, File Explorer, Notepad, Windows Settings and Vandal";

/// Frames that host another program's content (Store-style apps, like
/// Windows Settings): the content's program is the one that counts.
const HOSTS: &[&str] = &["applicationframehost.exe"];

/// Each step scrolls this share of the area, leaving the rest as overlap.
const STEP: f64 = 0.75;
/// Waiting for a smooth scroll to finish: no new frame for this long.
const QUIET: Duration = Duration::from_millis(120);
/// Most a frame may take to settle (animation, video).
const SETTLE_CAP: Duration = Duration::from_millis(3000);

/// What will be scrolled and captured.
pub struct Target {
    /// The top-level window: captured with WGC.
    pub root: HWND,
    /// The window under the point: wheel messages go here.
    child: HWND,
    point: POINT,
    /// The scrolling area, in screen (virtual-desktop) physical px.
    pub area: PhysicalRect,
    /// The root's extended frame bounds: WGC's frames show exactly this.
    pub frame: PhysicalRect,
    /// DPI scale of the window (1.0 = 96 DPI).
    pub scale: f64,
    /// How many screens tall the page is, when UI Automation says.
    pub screens: Option<f64>,
    pattern: Option<IUIAutomationScrollPattern>,
    /// For the log: what UI Automation found.
    pub describe: String,
}

impl Target {
    /// Scrolled with UI Automation (else the wheel).
    pub fn has_pattern(&self) -> bool {
        self.pattern.is_some()
    }

    /// The area in the frame's own pixels: what to cut out of each frame.
    pub fn crop(&self) -> PhysicalRect {
        PhysicalRect::new(
            self.area.x - self.frame.x,
            self.area.y - self.frame.y,
            self.area.width,
            self.area.height,
        )
    }

    pub fn scroller(&self) -> Box<dyn Scroller> {
        match &self.pattern {
            Some(p) => Box::new(UiaScroller::new(p.clone(), self.area.height as u32)),
            None => Box::new(WheelScroller::new(
                self.child,
                self.point,
                self.area.height as u32,
                self.scale,
            )),
        }
    }
}

fn rect(r: RECT) -> PhysicalRect {
    PhysicalRect::new(r.left, r.top, r.right - r.left, r.bottom - r.top)
}

/// UI Automation, set up once on the thread that uses it.
pub struct Finder {
    automation: IUIAutomation,
    /// Per element: its rect, control type, framework and scroll pattern.
    cache: IUIAutomationCacheRequest,
    /// The control view: what UIA clients normally see.
    view: IUIAutomationCondition,
}

/// What a descent found.
#[derive(Default)]
struct Found {
    scroller: Option<IUIAutomationElement>,
    /// The innermost Document, and whether Chromium made it.
    doc: Option<(IUIAutomationElement, bool)>,
    calls: u32,
}

impl Finder {
    /// COM must be initialized on this thread.
    pub fn new() -> Option<Self> {
        let automation: IUIAutomation =
            unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }.ok()?;
        let cache = unsafe { automation.CreateCacheRequest() }.ok()?;
        unsafe {
            cache.AddProperty(UIA_BoundingRectanglePropertyId).ok()?;
            cache.AddProperty(UIA_ControlTypePropertyId).ok()?;
            cache.AddProperty(UIA_FrameworkIdPropertyId).ok()?;
            cache.AddPattern(UIA_ScrollPatternId).ok()?;
            cache
                .AddProperty(UIA_ScrollVerticalViewSizePropertyId)
                .ok()?;
            cache
                .AddProperty(UIA_ScrollVerticallyScrollablePropertyId)
                .ok()?;
        }
        let view = unsafe { automation.ControlViewCondition() }.ok()?;
        Some(Self {
            automation,
            cache,
            view,
        })
    }

    /// The scrolling area at `point` in the top-level window `root`: the
    /// innermost vertically scrollable element there, or failing that the
    /// innermost page (a `Document`: Firefox's has no scroll pattern).
    ///
    /// It never asks what's on top at the point, which would be the capture
    /// overlay (PLAN 3K.4 spike): it goes down `root`'s child windows (each
    /// parent hit-tests its own; that reaches content another process draws,
    /// like WebView2's and WinUI's), then down UIA's tree from there,
    /// following the children that hold the point. `patient` waits for
    /// Chromium, which shows only the page until its accessibility tree is
    /// built (Vandal's Settings has its scrolling pane inside).
    pub fn find(&self, root: HWND, point: POINT, patient: bool) -> Option<Target> {
        // Firefox's page has no scroll pattern: it's the one place the page
        // (a Document) stands in for a scroller. Elsewhere a page without one
        // doesn't scroll itself (Vandal's Settings: its pane does).
        let page_ok = app_of(root, point).as_deref() == Some("firefox.exe");
        let mut frame = RECT::default();
        unsafe {
            DwmGetWindowAttribute(
                root,
                DWMWA_EXTENDED_FRAME_BOUNDS,
                &mut frame as *mut _ as *mut _,
                std::mem::size_of::<RECT>() as u32,
            )
            .ok()?;
        }
        let scale = unsafe { GetDpiForWindow(root) } as f64 / 96.0;
        let child = deepest_child(root, point);
        let attempts = if patient { 6 } else { 1 };
        let mut found = Found::default();
        for attempt in 0..attempts {
            if attempt > 0 {
                std::thread::sleep(Duration::from_millis(300));
            }
            found = Found::default();
            let starts = if child == root {
                vec![root]
            } else {
                vec![child, root]
            };
            for start in starts {
                let Ok(el) = (unsafe {
                    self.automation
                        .ElementFromHandleBuildCache(start, &self.cache)
                }) else {
                    continue;
                };
                if !self.visit(&el, 0, point, &mut found) && scrolls(&el) {
                    // The window's own element is the scroller (Explorer's list).
                    found.scroller = Some(el);
                }
                if found.scroller.is_some() || found.doc.is_some() {
                    break;
                }
            }
            // Chromium shows only the page until its tree is built: a pane
            // inside may turn out to be the scroller.
            let building = found.scroller.is_none() && found.doc.as_ref().is_some_and(|d| d.1);
            if !building {
                break;
            }
        }
        let calls = found.calls;
        let (el, pattern, kind) = match (found.scroller, found.doc) {
            (Some(el), _) => {
                let p = unsafe {
                    el.GetCurrentPatternAs::<IUIAutomationScrollPattern>(UIA_ScrollPatternId)
                }
                .ok()?;
                (el, Some(p), "scroller")
            }
            (None, Some((el, _))) if page_ok => (el, None, "document"),
            (None, doc) => {
                if cfg!(debug_assertions) {
                    eprintln!(
                        "[scroll] nothing at {},{}: page {:?} ({calls} UIA calls)",
                        point.x,
                        point.y,
                        doc.map(|(d, chromium)| (describe(&d), chromium))
                    );
                }
                return None;
            }
        };
        let area = rect(unsafe { el.CachedBoundingRectangle() }.unwrap_or_default());
        let screens = pattern.as_ref().and_then(|p| {
            let v = unsafe { p.CurrentVerticalViewSize() }.ok()?;
            (v > 0.0 && v < 100.0).then(|| 100.0 / v)
        });
        Some(Target {
            root,
            child,
            point,
            area,
            frame: rect(frame),
            scale,
            screens,
            describe: format!("{kind} {} ({calls} UIA calls)", describe(&el)),
            pattern,
        })
    }

    /// Depth first through the children of `el` that hold the point, later
    /// siblings first (usually drawn on top), backing out of dead ends:
    /// WebView2 stacks same-sized panes, and the page may be under the first.
    /// True once a scroller is found (the innermost one).
    fn visit(&self, el: &IUIAutomationElement, depth: usize, point: POINT, f: &mut Found) -> bool {
        if depth > 60 || f.calls > 300 {
            return false;
        }
        f.calls += 1;
        let Ok(kids) =
            (unsafe { el.FindAllBuildCache(TreeScope_Children, &self.view, &self.cache) })
        else {
            return false;
        };
        let n = unsafe { kids.Length() }.unwrap_or(0);
        for i in (0..n).rev() {
            let Ok(k) = (unsafe { kids.GetElement(i) }) else {
                continue;
            };
            let r = unsafe { k.CachedBoundingRectangle() }.unwrap_or_default();
            if !(point.x >= r.left && point.x < r.right && point.y >= r.top && point.y < r.bottom) {
                continue;
            }
            if unsafe { k.CachedControlType() }.is_ok_and(|t| t == UIA_DocumentControlTypeId) {
                let chromium = unsafe { k.CachedFrameworkId() }.is_ok_and(|f| f == "Chrome");
                f.doc = Some((k.clone(), chromium));
            }
            if self.visit(&k, depth + 1, point, f) {
                return true;
            }
            if scrolls(&k) {
                f.scroller = Some(k);
                return true;
            }
        }
        false
    }
}

/// The scrolling area under `point`, whatever window is there (dev builds'
/// `--scroll-at`, with no overlay up). COM must be initialized on this thread.
pub fn find_at(point: POINT) -> Option<Target> {
    let child = unsafe { WindowFromPoint(point) };
    if child.is_invalid() {
        return None;
    }
    let root = unsafe { GetAncestor(child, GA_ROOT) };
    if !supported(root, point) {
        eprintln!("[scroll] {:?} isn't a supported app", app_of(root, point));
        return None;
    }
    Finder::new()?.find(root, point, true)
}

/// The deepest child window of `root` under the screen `point`, by Win32
/// alone: each parent hit-tests its own children, so a window on top of
/// `root` doesn't matter.
fn deepest_child(root: HWND, point: POINT) -> HWND {
    let mut cur = root;
    for _ in 0..16 {
        let mut p = point;
        unsafe {
            let _ = ScreenToClient(cur, &mut p);
        }
        let next = unsafe {
            ChildWindowFromPointEx(
                cur,
                p,
                CWP_SKIPINVISIBLE | CWP_SKIPDISABLED | CWP_SKIPTRANSPARENT,
            )
        };
        if next.is_invalid() || next == cur {
            break;
        }
        cur = next;
    }
    cur
}

/// Vertically scrollable with something to scroll (less than all of it in
/// view), from the cache.
fn scrolls(e: &IUIAutomationElement) -> bool {
    let Ok(p) =
        (unsafe { e.GetCachedPatternAs::<IUIAutomationScrollPattern>(UIA_ScrollPatternId) })
    else {
        return false;
    };
    let scrollable = unsafe { p.CachedVerticallyScrollable() }.is_ok_and(|b| b.as_bool());
    let view = unsafe { p.CachedVerticalViewSize() }.unwrap_or(100.0);
    scrollable && view > 0.0 && view < 99.5
}

/// The program (lowercase file name) that draws `root` at `point`: for a
/// host frame, the program of the content under the point.
pub fn app_of(root: HWND, point: POINT) -> Option<String> {
    let name = exe_name(root)?;
    if HOSTS.contains(&name.as_str()) {
        return exe_name(deepest_child(root, point));
    }
    Some(name)
}

/// Whether scrolling capture is offered for the window `root` at `point`.
pub fn supported(root: HWND, point: POINT) -> bool {
    app_of(root, point).is_some_and(|n| SUPPORTED.contains(&n.as_str()))
}

fn exe_name(hwnd: HWND) -> Option<String> {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pid == 0 {
        return None;
    }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    let ok = unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
    };
    unsafe {
        let _ = CloseHandle(process);
    }
    ok.ok()?;
    let path = String::from_utf16_lossy(&buf[..len as usize]);
    path.rsplit(['\\', '/'])
        .next()
        .map(|n| n.to_ascii_lowercase())
}

fn describe(e: &IUIAutomationElement) -> String {
    let framework = unsafe { e.CachedFrameworkId() }
        .map(|b| b.to_string())
        .unwrap_or_default();
    let class = unsafe { e.CurrentClassName() }
        .map(|b| b.to_string())
        .unwrap_or_default();
    format!("{framework} \"{class}\"")
}

/// UI Automation: set the scroll percent, stepping by [`STEP`] of the area.
///
/// The percent for each step is aimed by measurement, not trusted from the
/// page's reported length: on some pages Chromium's percent moves further
/// than its view size implies (3K.4: vandalscreenshot.com, 1.32× in Chrome
/// and Edge, so 75% steps moved a whole view and left nothing to match), and
/// pages grow as they scroll (lazy-loaded images). So the first step is a
/// cautious [`FIRST_STEP`]; the stitcher's measured shift then gives the
/// real pixels per percent, re-measured every step. The position is kept in
/// measured pixels, since Chrome reports its own late.
struct UiaScroller {
    pattern: IUIAutomationScrollPattern,
    view_px: u32,
    /// Measured pixels from the top.
    pos: f64,
    /// Real pixels per pixel the reported length implies, once measured.
    scale: Option<f64>,
    /// The percent set by the last step, and the one before it.
    percent: f64,
    from: f64,
    /// Pixels out of view (page − viewport) by the reported length, at the
    /// last step.
    hidden: f64,
    expected: Option<u32>,
}

/// The first step, as a share of the area: small enough to overlap even if
/// the page moves twice as far as it says.
const FIRST_STEP: f64 = 0.4;

impl UiaScroller {
    fn new(pattern: IUIAutomationScrollPattern, view_px: u32) -> Self {
        Self {
            pattern,
            view_px,
            pos: 0.0,
            scale: None,
            percent: 0.0,
            from: 0.0,
            hidden: 0.0,
            expected: None,
        }
    }

    fn set(&self, percent: f64) -> Result<(), String> {
        unsafe {
            self.pattern
                .SetScrollPercent(UIA_ScrollPatternNoScroll, percent)
        }
        .map_err(|e| e.to_string())
    }

    /// Pixels out of view by the reported share of the page in view.
    fn hidden_now(&self) -> Result<f64, String> {
        let view = unsafe { self.pattern.CurrentVerticalViewSize() }
            .map_err(|e| e.to_string())?
            .clamp(0.1, 100.0)
            / 100.0;
        // viewport = view × page, so page − viewport = viewport × (1/view − 1).
        Ok(self.view_px as f64 * (1.0 / view - 1.0))
    }
}

impl Scroller for UiaScroller {
    fn to_top(&mut self) -> bool {
        self.pos = 0.0;
        self.percent = 0.0;
        self.hidden = self.hidden_now().unwrap_or(0.0);
        self.set(0.0).is_ok()
    }

    fn step(&mut self) -> Result<(), String> {
        self.hidden = self.hidden_now()?;
        let view = self.view_px as f64;
        let (want, k) = match self.scale {
            Some(k) => (STEP * view, k),
            None => (FIRST_STEP * view, 1.0),
        };
        let percent = if self.hidden > 0.0 {
            ((self.pos + want) / (k * self.hidden) * 100.0).clamp(self.percent, 100.0)
        } else {
            100.0
        };
        // Unknown until measured: a wrong hint would mislead the stitcher.
        self.expected = self
            .scale
            .map(|k| ((percent - self.percent) / 100.0 * self.hidden * k).round() as u32);
        if cfg!(debug_assertions) {
            eprintln!(
                "[scroll] step: pos {:.0}, hidden {:.0} (reported view {:.2}%), scale {:?} -> {percent:.2}%",
                self.pos,
                self.hidden,
                100.0 * view / (self.hidden + view),
                self.scale
            );
        }
        self.from = self.percent;
        self.percent = percent;
        self.set(percent)
    }

    fn moved(&mut self, d: u32) {
        if cfg!(debug_assertions) {
            let now = self.hidden_now().unwrap_or(-1.0);
            eprintln!("[scroll] moved {d} px; hidden now {now:.0}");
        }
        self.pos += d as f64;
        // What the reported length said the step would move. Not from a step
        // cut short by the bottom.
        let implied = (self.percent - self.from) / 100.0 * self.hidden;
        if self.percent < 100.0 && implied > 20.0 {
            self.scale = Some((d as f64 / implied).clamp(0.25, 4.0));
        }
    }

    fn at_end(&self) -> Option<bool> {
        Some(self.percent >= 100.0)
    }

    fn expected_shift(&self) -> Option<u32> {
        self.expected
    }

    fn progress(&self) -> Option<f64> {
        let view = self.view_px as f64;
        let page = self.scale.unwrap_or(1.0) * self.hidden + view;
        Some(((self.pos + view) / page).min(1.0))
    }
}

/// Mouse-wheel messages posted to the window under the point. Its length and
/// end are unknown: the end is when a step changes nothing.
struct WheelScroller {
    hwnd: HWND,
    point: POINT,
    notches: i32,
}

impl WheelScroller {
    fn new(hwnd: HWND, point: POINT, view_px: u32, scale: f64) -> Self {
        // Browsers scroll ~100 CSS px a notch (Chrome 100, Firefox 102).
        let px = 100.0 * scale;
        let notches = (STEP * view_px as f64 / px).floor().clamp(1.0, 20.0) as i32;
        Self {
            hwnd,
            point,
            notches,
        }
    }

    fn wheel(&self, notches: i32) -> Result<(), String> {
        let delta = (WHEEL_DELTA as i32 * notches) as i16 as u16 as usize;
        let at = ((self.point.y as u16 as isize) << 16) | self.point.x as u16 as isize;
        unsafe {
            PostMessageW(
                Some(self.hwnd),
                WM_MOUSEWHEEL,
                WPARAM(delta << 16),
                LPARAM(at),
            )
        }
        .map_err(|e| e.to_string())
    }
}

impl Scroller for WheelScroller {
    fn to_top(&mut self) -> bool {
        // Far enough for any page we'd capture (65,000 px is ~650 notches).
        let mut ok = true;
        for _ in 0..70 {
            ok &= self.wheel(10).is_ok();
        }
        ok
    }

    fn step(&mut self) -> Result<(), String> {
        self.wheel(-self.notches)
    }

    fn at_end(&self) -> Option<bool> {
        None
    }

    fn expected_shift(&self) -> Option<u32> {
        None
    }

    fn progress(&self) -> Option<f64> {
        None
    }
}

/// The window's frames, cut to the area.
pub struct AreaFrames {
    stream: Box<dyn WindowStream>,
    crop: PhysicalRect,
}

impl AreaFrames {
    pub fn new(stream: Box<dyn WindowStream>, crop: PhysicalRect) -> Self {
        Self { stream, crop }
    }
}

impl Frames for AreaFrames {
    fn settled(&mut self, first: Duration) -> Result<Image, String> {
        let w = self
            .stream
            .settled(first, QUIET, SETTLE_CAP)
            .map_err(|e| e.to_string())?;
        let whole = Image {
            width: w.width,
            height: w.height,
            bgra: w.bgra,
        };
        let c = self.crop;
        let (l, t) = (c.x.max(0) as u32, c.y.max(0) as u32);
        let (r, b) = (
            (c.x + c.width).max(0) as u32,
            (c.y + c.height).max(0) as u32,
        );
        Ok(whole.crop(l, t, r, b))
    }
}

/// BGRA (alpha ignored) to opaque RGBA, for the editor.
pub fn to_rgba(img: &Image) -> Vec<u8> {
    let mut rgba = img.bgra.clone();
    for px in rgba.chunks_exact_mut(4) {
        px.swap(0, 2);
        px[3] = 255;
    }
    rgba
}
