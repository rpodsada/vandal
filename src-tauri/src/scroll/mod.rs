//! Scrolling capture (PLAN 3K): scroll an area from the top to the bottom,
//! grabbing a frame after each step, and stitch the frames into one tall
//! image. Findings and numbers from the 3K.0 spike are in `decisions.md`
//! (2026-10-02).
//!
//! The loop here is generic over a [`Scroller`] (what moves the area) and a
//! [`Frames`] source (what shows it), so it's tested with a fake page. The
//! Windows side (UI Automation, the mouse wheel, Windows.Graphics.Capture)
//! is in [`windows`].

pub mod app;
pub mod stitch;
pub mod windows;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use stitch::{Image, Params, Step, Stitcher};

/// The tallest image: WebView2 can't draw a canvas taller than 65,535 px,
/// and the editor's export draws one the image's size (3K.0 spike).
pub const MAX_HEIGHT: u32 = 65_000;

/// Moves the area being captured.
pub trait Scroller {
    /// Scroll to the very top. False if that's known to have failed.
    fn to_top(&mut self) -> bool;
    /// Scroll down by about one step.
    fn step(&mut self) -> Result<(), String>;
    /// Whether the last step reached the bottom, if the scroller can tell
    /// (UI Automation can; the wheel can't, so the end is when nothing moves).
    fn at_end(&self) -> Option<bool>;
    /// How far the last step should have moved the area, in px, if known.
    fn expected_shift(&self) -> Option<u32>;
    /// The share of the page seen so far (0..1), if known.
    fn progress(&self) -> Option<f64>;
}

/// Shows the area being captured.
pub trait Frames {
    /// The area once it has stopped changing (a smooth scroll can take a few
    /// hundred ms): wait up to `first` for a change, then until nothing
    /// changes for a while. Same size every time, unless the window resized.
    fn settled(&mut self, first: Duration) -> Result<Image, String>;
}

/// How long to wait for a step to show before deciding nothing moved.
const STEP_WAIT: Duration = Duration::from_millis(700);
/// Before the first frame, and after scrolling to the top.
const START_WAIT: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum End {
    /// Reached the bottom.
    Bottom,
    /// The user stopped it.
    Stopped,
    /// Reached [`MAX_HEIGHT`].
    Limit,
    /// The page changed in a way that couldn't be matched (still loading,
    /// animating), or the window was resized. Everything before is kept.
    Changed,
    /// The first step didn't move anything: the image is what was visible.
    NoScroll,
}

#[derive(Debug, Clone, Copy)]
pub struct Progress {
    /// Image height so far, px.
    pub height: u32,
    pub frames: u32,
    /// 0..1 when the scroller knows the page's length.
    pub fraction: Option<f64>,
}

pub struct Outcome {
    pub image: Image,
    pub end: End,
    pub frames: u32,
    pub took: Duration,
}

pub struct Options {
    pub params: Params,
    pub max_height: u32,
    /// Safety net: never more steps than this (a page that keeps growing).
    pub max_steps: u32,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            params: Params::for_scale(1.0),
            max_height: MAX_HEIGHT,
            max_steps: 500,
        }
    }
}

/// Capture the area from the top: scroll there, then step down until the
/// end, the height limit or `stop`. Scrolls back to the top afterwards.
pub fn run(
    scroller: &mut dyn Scroller,
    frames: &mut dyn Frames,
    opts: &Options,
    stop: &AtomicBool,
    mut progress: impl FnMut(Progress),
) -> Result<Outcome, String> {
    let started = Instant::now();
    scroller.to_top();
    let first = frames.settled(START_WAIT)?;
    let size = (first.width, first.height);
    let mut stitcher = Stitcher::new(first, opts.params);
    let mut count = 1u32;
    let mut moved = false;
    let mut last_shift = None;
    progress(Progress {
        height: stitcher.height(),
        frames: count,
        fraction: scroller.progress(),
    });

    let end = loop {
        if stop.load(Ordering::Relaxed) {
            break End::Stopped;
        }
        if stitcher.height() >= opts.max_height {
            break End::Limit;
        }
        if count > opts.max_steps {
            break End::Limit;
        }
        if let Err(e) = scroller.step() {
            eprintln!("[scroll] step failed: {e}");
            break if moved { End::Changed } else { End::NoScroll };
        }
        let frame = frames.settled(STEP_WAIT)?;
        if stop.load(Ordering::Relaxed) {
            break End::Stopped;
        }
        if (frame.width, frame.height) != size {
            eprintln!("[scroll] the window was resized");
            break End::Changed;
        }
        // The wheel can't say how far it goes; the last step is the best guess.
        let hint = scroller.expected_shift().or(last_shift);
        match stitcher.push(frame, hint) {
            Step::Same => break if moved { End::Bottom } else { End::NoScroll },
            Step::Moved(d) => {
                moved = true;
                last_shift = Some(d);
                count += 1;
                progress(Progress {
                    height: stitcher.height().min(opts.max_height),
                    frames: count,
                    fraction: scroller.progress(),
                });
                if scroller.at_end() == Some(true) {
                    break End::Bottom;
                }
            }
            Step::Lost(why) => {
                eprintln!("[scroll] lost the page: {why}");
                break End::Changed;
            }
        }
    };
    let image = stitcher.finish(opts.max_height);
    scroller.to_top();
    Ok(Outcome {
        image,
        end,
        frames: count,
        took: started.elapsed(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    fn page(width: u32, height: u32) -> Image {
        let mut bgra = Vec::new();
        for y in 0..height as u64 {
            for x in 0..width as u64 {
                let mut h = (x / 2) ^ y.wrapping_mul(0x9e37_79b9_7f4a_7c15);
                h = h.wrapping_mul(0xff51_afd7_ed55_8ccd);
                h ^= h >> 31;
                let v = (h % 251) as u8;
                bgra.extend_from_slice(&[v, v ^ 0x55, v / 3, 255]);
            }
        }
        Image {
            width,
            height,
            bgra,
        }
    }

    /// A page in a viewport, shared by the fake scroller and screen.
    struct Page {
        page: Image,
        view: u32,
        step: u32,
        offset: u32,
        /// Steps don't move anything (an app that ignores scrolling).
        stuck: bool,
        /// Report the end like UI Automation does.
        knows_end: bool,
        /// Set the stop flag after this many steps.
        stop_after: Option<u32>,
        steps: u32,
        tops: u32,
    }

    impl Page {
        fn new(page: Image, view: u32, step: u32) -> Rc<RefCell<Self>> {
            Rc::new(RefCell::new(Self {
                page,
                view,
                step,
                offset: 123,
                stuck: false,
                knows_end: false,
                stop_after: None,
                steps: 0,
                tops: 0,
            }))
        }
        fn max(&self) -> u32 {
            self.page.height - self.view
        }
    }

    struct FakeScroller(Rc<RefCell<Page>>, Rc<AtomicBool>);
    struct FakeScreen(Rc<RefCell<Page>>);

    impl Scroller for FakeScroller {
        fn to_top(&mut self) -> bool {
            let mut p = self.0.borrow_mut();
            p.tops += 1;
            p.offset = 0;
            true
        }
        fn step(&mut self) -> Result<(), String> {
            let mut p = self.0.borrow_mut();
            p.steps += 1;
            if p.stop_after.is_some_and(|n| p.steps > n) {
                self.1.store(true, Ordering::Relaxed);
            }
            if !p.stuck {
                p.offset = (p.offset + p.step).min(p.max());
            }
            Ok(())
        }
        fn at_end(&self) -> Option<bool> {
            let p = self.0.borrow();
            p.knows_end.then(|| p.offset >= p.max())
        }
        fn expected_shift(&self) -> Option<u32> {
            None
        }
        fn progress(&self) -> Option<f64> {
            None
        }
    }

    impl Frames for FakeScreen {
        fn settled(&mut self, _first: Duration) -> Result<Image, String> {
            let p = self.0.borrow();
            Ok(p.page.crop(0, p.offset, p.page.width, p.offset + p.view))
        }
    }

    fn run_fake(page: &Rc<RefCell<Page>>, opts: &Options) -> (Outcome, Vec<Progress>) {
        let stop = Rc::new(AtomicBool::new(false));
        let mut seen = Vec::new();
        let out = run(
            &mut FakeScroller(page.clone(), stop.clone()),
            &mut FakeScreen(page.clone()),
            opts,
            &stop,
            |p| seen.push(p),
        )
        .unwrap();
        (out, seen)
    }

    #[test]
    fn captures_the_whole_page_from_the_top_and_goes_back() {
        let p = page(100, 1000);
        let f = Page::new(p.clone(), 300, 220);
        let (out, seen) = run_fake(&f, &Options::default());
        assert_eq!(out.end, End::Bottom);
        assert_eq!(out.image, p);
        assert_eq!(f.borrow().offset, 0, "back at the top");
        assert_eq!(f.borrow().tops, 2);
        assert_eq!(seen.last().unwrap().height, 1000);
    }

    #[test]
    fn knowing_the_end_saves_a_step() {
        let p = page(100, 1000);
        let f = Page::new(p.clone(), 300, 220);
        f.borrow_mut().knows_end = true;
        let (out, _) = run_fake(&f, &Options::default());
        assert_eq!(out.end, End::Bottom);
        assert_eq!(out.image, p);
        assert_eq!(f.borrow().steps, 4); // 220, 440, 660, then 700 = the end
    }

    #[test]
    fn stops_when_asked_and_keeps_what_it_has() {
        let p = page(100, 2000);
        let f = Page::new(p.clone(), 300, 200);
        f.borrow_mut().stop_after = Some(2);
        let (out, _) = run_fake(&f, &Options::default());
        assert_eq!(out.end, End::Stopped);
        assert_eq!(out.image, p.crop(0, 0, 100, 700));
        assert_eq!(f.borrow().offset, 0);
    }

    #[test]
    fn stops_at_the_height_limit() {
        let p = page(100, 3000);
        let f = Page::new(p.clone(), 300, 250);
        let opts = Options {
            max_height: 1000,
            ..Options::default()
        };
        let (out, _) = run_fake(&f, &opts);
        assert_eq!(out.end, End::Limit);
        assert_eq!(out.image, p.crop(0, 0, 100, 1000));
    }

    #[test]
    fn an_area_that_will_not_scroll_gives_what_was_visible() {
        let p = page(100, 1000);
        let f = Page::new(p.clone(), 300, 200);
        f.borrow_mut().stuck = true;
        let (out, _) = run_fake(&f, &Options::default());
        assert_eq!(out.end, End::NoScroll);
        assert_eq!(out.image, p.crop(0, 0, 100, 300));
    }
}
