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

use std::time::Duration;

use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationScrollPattern,
    UIA_DocumentControlTypeId, UIA_ScrollPatternId, UIA_ScrollPatternNoScroll,
};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, PostMessageW, WindowFromPoint, GA_ROOT, WHEEL_DELTA, WM_MOUSEWHEEL,
};

use super::stitch::Image;
use super::{Frames, Scroller};
use crate::capture::WindowStream;
use crate::geometry::PhysicalRect;

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

/// The scrolling area under `point`: the nearest vertically scrollable
/// element above the one there, or failing that the page (a `Document`).
/// Chromium builds its accessibility tree on the first query, so this retries.
/// COM must be initialized on this thread.
pub fn find_at(point: POINT) -> Option<Target> {
    let child = unsafe { WindowFromPoint(point) };
    if child.is_invalid() {
        return None;
    }
    let root = unsafe { GetAncestor(child, GA_ROOT) };
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
    let automation: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }.ok()?;
    let walker = unsafe { automation.ControlViewWalker() }.ok()?;

    // (rect, description, built by Chromium)
    let mut doc: Option<(PhysicalRect, String, bool)> = None;
    for attempt in 0..6 {
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(300));
        }
        let mut el = unsafe { automation.ElementFromPoint(point) }.ok();
        let mut depth = 0;
        while let Some(e) = el {
            if doc.is_none() && is_document(&e) {
                let chromium = unsafe { e.CurrentFrameworkId() }.is_ok_and(|f| f == "Chrome");
                doc = Some((element_rect(&e), describe(&e, depth), chromium));
            }
            if let Some(p) = vertical_scroller(&e) {
                return Some(Target {
                    root,
                    child,
                    point,
                    area: element_rect(&e),
                    frame: rect(frame),
                    scale,
                    pattern: Some(p),
                    describe: format!("scroller {}", describe(&e, depth)),
                });
            }
            el = unsafe { walker.GetParentElement(&e) }.ok();
            depth += 1;
        }
        // Chromium answers the first queries with just the page, until it has
        // built its accessibility tree; a page that doesn't scroll itself may
        // have a pane inside that does (Vandal's Settings), so keep asking.
        // Firefox's page is the real thing at once.
        if doc.as_ref().is_some_and(|d| !d.2) {
            break;
        }
    }
    let (area, d, _) = doc?;
    Some(Target {
        root,
        child,
        point,
        area,
        frame: rect(frame),
        scale,
        pattern: None,
        describe: format!("document {d}"),
    })
}

fn vertical_scroller(e: &IUIAutomationElement) -> Option<IUIAutomationScrollPattern> {
    let p: IUIAutomationScrollPattern =
        unsafe { e.GetCurrentPatternAs(UIA_ScrollPatternId) }.ok()?;
    let scrollable = unsafe { p.CurrentVerticallyScrollable() }.ok()?.as_bool();
    scrollable.then_some(p)
}

fn is_document(e: &IUIAutomationElement) -> bool {
    unsafe { e.CurrentControlType() }.is_ok_and(|t| t == UIA_DocumentControlTypeId)
}

fn element_rect(e: &IUIAutomationElement) -> PhysicalRect {
    rect(unsafe { e.CurrentBoundingRectangle() }.unwrap_or_default())
}

fn describe(e: &IUIAutomationElement, depth: usize) -> String {
    let framework = unsafe { e.CurrentFrameworkId() }
        .map(|b| b.to_string())
        .unwrap_or_default();
    let class = unsafe { e.CurrentClassName() }
        .map(|b| b.to_string())
        .unwrap_or_default();
    format!("{framework} \"{class}\" (depth {depth})")
}

/// UI Automation: set the scroll percent, stepping by [`STEP`] of the area.
/// Steps come from our own running target, since Chrome reports its position
/// late.
struct UiaScroller {
    pattern: IUIAutomationScrollPattern,
    view_px: u32,
    goal: f64,
    expected: Option<u32>,
    /// The share of the page in view, 0..1, as of the last step.
    view: f64,
}

impl UiaScroller {
    fn new(pattern: IUIAutomationScrollPattern, view_px: u32) -> Self {
        Self {
            pattern,
            view_px,
            goal: 0.0,
            expected: None,
            view: 1.0,
        }
    }

    fn set(&self, percent: f64) -> Result<(), String> {
        unsafe {
            self.pattern
                .SetScrollPercent(UIA_ScrollPatternNoScroll, percent)
        }
        .map_err(|e| e.to_string())
    }
}

impl Scroller for UiaScroller {
    fn to_top(&mut self) -> bool {
        self.goal = 0.0;
        if let Ok(v) = unsafe { self.pattern.CurrentVerticalViewSize() } {
            self.view = v.clamp(0.1, 100.0) / 100.0;
        }
        self.set(0.0).is_ok()
    }

    fn step(&mut self) -> Result<(), String> {
        let view = unsafe { self.pattern.CurrentVerticalViewSize() }
            .map_err(|e| e.to_string())?
            .clamp(0.1, 99.9)
            / 100.0;
        self.view = view;
        // percent p puts the top at p × (page − viewport); viewport = view × page.
        let hidden = self.view_px as f64 * (1.0 / view - 1.0);
        let dp = STEP * self.view_px as f64 / hidden * 100.0;
        let goal = (self.goal + dp).min(100.0);
        self.expected = Some(((goal - self.goal) / 100.0 * hidden).round() as u32);
        self.goal = goal;
        self.set(goal)
    }

    fn at_end(&self) -> Option<bool> {
        Some(self.goal >= 100.0)
    }

    fn expected_shift(&self) -> Option<u32> {
        self.expected
    }

    fn progress(&self) -> Option<f64> {
        Some((self.goal / 100.0 * (1.0 - self.view) + self.view).min(1.0))
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
