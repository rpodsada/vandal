//! Geometry newtypes (PLAN §4.4).
//!
//! Physical pixels in virtual-desktop coordinates are the source of truth. Origins
//! can be negative for monitors left of / above the primary. Conversion to CSS
//! (logical) pixels happens only at the display edge and is always per-monitor.
//!
//! Rects are half-open: a rect covers `x..x+width` and `y..y+height`.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Tolerance for float → pixel conversions so that e.g. `(2 / 1.5) * 1.5`
/// (= 1.9999…) still lands on pixel 2.
const EPS: f64 = 1e-6;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize, Type)]
pub struct PhysicalPoint {
    pub x: i32,
    pub y: i32,
}

impl PhysicalPoint {
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize, Type)]
pub struct PhysicalRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl PhysicalRect {
    /// Negative sizes are clamped to zero.
    pub const fn new(x: i32, y: i32, width: i32, height: i32) -> Self {
        Self {
            x,
            y,
            width: if width < 0 { 0 } else { width },
            height: if height < 0 { 0 } else { height },
        }
    }

    /// From left/top/right/bottom edges (right/bottom exclusive), as in a Win32 `RECT`.
    pub fn from_ltrb(left: i32, top: i32, right: i32, bottom: i32) -> Self {
        Self::new(left, top, right - left, bottom - top)
    }

    /// Normalized rect spanning two corner points in any order (e.g. a drag).
    pub fn from_points(a: PhysicalPoint, b: PhysicalPoint) -> Self {
        Self::from_ltrb(a.x.min(b.x), a.y.min(b.y), a.x.max(b.x), a.y.max(b.y))
    }

    pub const fn left(&self) -> i32 {
        self.x
    }
    pub const fn top(&self) -> i32 {
        self.y
    }
    /// Exclusive.
    pub const fn right(&self) -> i32 {
        self.x.saturating_add(self.width)
    }
    /// Exclusive.
    pub const fn bottom(&self) -> i32 {
        self.y.saturating_add(self.height)
    }
    pub const fn origin(&self) -> PhysicalPoint {
        PhysicalPoint::new(self.x, self.y)
    }
    pub const fn is_empty(&self) -> bool {
        self.width <= 0 || self.height <= 0
    }
    pub fn area(&self) -> i64 {
        i64::from(self.width) * i64::from(self.height)
    }

    pub fn contains(&self, p: PhysicalPoint) -> bool {
        p.x >= self.left() && p.x < self.right() && p.y >= self.top() && p.y < self.bottom()
    }

    pub fn contains_rect(&self, other: &PhysicalRect) -> bool {
        !other.is_empty()
            && other.left() >= self.left()
            && other.top() >= self.top()
            && other.right() <= self.right()
            && other.bottom() <= self.bottom()
    }

    /// Overlapping area, or `None` if the rects don't overlap (touching edges don't count).
    pub fn intersect(&self, other: &PhysicalRect) -> Option<PhysicalRect> {
        let r = Self::from_ltrb(
            self.left().max(other.left()),
            self.top().max(other.top()),
            self.right().min(other.right()),
            self.bottom().min(other.bottom()),
        );
        (!r.is_empty()).then_some(r)
    }

    /// Smallest rect containing both. Empty rects are ignored.
    pub fn union(&self, other: &PhysicalRect) -> PhysicalRect {
        match (self.is_empty(), other.is_empty()) {
            (true, _) => *other,
            (_, true) => *self,
            _ => Self::from_ltrb(
                self.left().min(other.left()),
                self.top().min(other.top()),
                self.right().max(other.right()),
                self.bottom().max(other.bottom()),
            ),
        }
    }

    /// Clamp this rect into `bounds`. `None` if nothing is left.
    pub fn clamp_to(&self, bounds: &PhysicalRect) -> Option<PhysicalRect> {
        self.intersect(bounds)
    }

    /// Nearest point inside the rect (right/bottom edges are exclusive, so the
    /// max is `right - 1`). `None` for an empty rect.
    pub fn clamp_point(&self, p: PhysicalPoint) -> Option<PhysicalPoint> {
        (!self.is_empty()).then(|| {
            PhysicalPoint::new(
                p.x.clamp(self.left(), self.right() - 1),
                p.y.clamp(self.top(), self.bottom() - 1),
            )
        })
    }

    pub fn translate(&self, dx: i32, dy: i32) -> PhysicalRect {
        Self::new(self.x + dx, self.y + dy, self.width, self.height)
    }

    /// This rect expressed relative to `origin`, e.g. virtual-desktop → monitor-local
    /// (which is also the frame buffer's coordinate space).
    pub fn relative_to(&self, origin: PhysicalPoint) -> PhysicalRect {
        self.translate(-origin.x, -origin.y)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize, Type)]
pub struct LogicalPoint {
    pub x: f64,
    pub y: f64,
}

/// CSS pixels, relative to one monitor's top-left corner.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize, Type)]
pub struct LogicalRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub index: u32,
    /// GDI device name, e.g. `\\.\DISPLAY1`.
    pub name: String,
    /// Full monitor bounds including the taskbar, virtual-desktop physical pixels.
    pub physical_bounds: PhysicalRect,
    pub work_area: PhysicalRect,
    /// Effective DPI / 96.
    pub scale_factor: f64,
    pub is_primary: bool,
}

impl MonitorInfo {
    /// The number Windows shows for it (Settings › Display › Identify): the
    /// digits ending the device name, `\.\DISPLAY2` → 2.
    pub fn display_number(&self) -> Option<u32> {
        let stem = self.name.trim_end_matches(|c: char| c.is_ascii_digit());
        self.name[stem.len()..].parse().ok()
    }

    /// For the tray's full-screen submenu: "Screen 2 (main) · 2560 × 1440".
    pub fn label(&self) -> String {
        let n = self.display_number().unwrap_or(self.index + 1);
        let main = if self.is_primary { " (main)" } else { "" };
        let r = self.physical_bounds;
        format!("Screen {n}{main} · {} × {}", r.width, r.height)
    }

    /// CSS point on this monitor's overlay → virtual-desktop physical pixel.
    ///
    /// Physical pixel `p` covers CSS `[p/scale, (p+1)/scale)`, so we floor.
    pub fn css_to_physical(&self, css: LogicalPoint) -> PhysicalPoint {
        let o = self.physical_bounds.origin();
        PhysicalPoint::new(
            o.x + (css.x * self.scale_factor + EPS).floor() as i32,
            o.y + (css.y * self.scale_factor + EPS).floor() as i32,
        )
    }

    /// Virtual-desktop physical pixel → CSS point on this monitor's overlay.
    pub fn physical_to_css(&self, p: PhysicalPoint) -> LogicalPoint {
        let o = self.physical_bounds.origin();
        LogicalPoint {
            x: f64::from(p.x - o.x) / self.scale_factor,
            y: f64::from(p.y - o.y) / self.scale_factor,
        }
    }

    /// Virtual-desktop physical rect → CSS rect on this monitor's overlay.
    pub fn physical_rect_to_css(&self, r: &PhysicalRect) -> LogicalRect {
        let local = r.relative_to(self.physical_bounds.origin());
        LogicalRect {
            x: f64::from(local.x) / self.scale_factor,
            y: f64::from(local.y) / self.scale_factor,
            width: f64::from(local.width) / self.scale_factor,
            height: f64::from(local.height) / self.scale_factor,
        }
    }
}

/// The monitor containing `p`, if any (points can fall in gaps between monitors).
pub fn monitor_at(monitors: &[MonitorInfo], p: PhysicalPoint) -> Option<&MonitorInfo> {
    monitors.iter().find(|m| m.physical_bounds.contains(p))
}

/// Bounding box of all monitors.
pub fn virtual_bounds(monitors: &[MonitorInfo]) -> PhysicalRect {
    monitors.iter().fold(PhysicalRect::default(), |acc, m| {
        acc.union(&m.physical_bounds)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pt(x: i32, y: i32) -> PhysicalPoint {
        PhysicalPoint::new(x, y)
    }

    #[test]
    fn monitors_are_named_as_windows_numbers_them() {
        let mut m = monitor(0, PhysicalRect::new(0, 0, 2560, 1440), 1.0);
        m.name = r"\\.\DISPLAY12".into();
        m.is_primary = true;
        assert_eq!(m.display_number(), Some(12));
        assert_eq!(m.label(), "Screen 12 (main) · 2560 × 1440");
        m.name = "odd".into();
        m.is_primary = false;
        assert_eq!(m.display_number(), None);
        assert_eq!(m.label(), "Screen 1 · 2560 × 1440");
    }

    fn monitor(index: u32, bounds: PhysicalRect, scale: f64) -> MonitorInfo {
        MonitorInfo {
            index,
            name: format!(r"\\.\DISPLAY{}", index + 1),
            physical_bounds: bounds,
            work_area: PhysicalRect::new(bounds.x, bounds.y, bounds.width, bounds.height - 48),
            scale_factor: scale,
            is_primary: bounds.origin() == pt(0, 0),
        }
    }

    /// 1080p @100% left of a 4K @150% primary, plus a 1440p @125% above-right
    /// that's vertically offset (negative y).
    fn layout() -> Vec<MonitorInfo> {
        vec![
            monitor(0, PhysicalRect::new(-1920, 400, 1920, 1080), 1.0),
            monitor(1, PhysicalRect::new(0, 0, 3840, 2160), 1.5),
            monitor(2, PhysicalRect::new(3840, -700, 2560, 1440), 1.25),
        ]
    }

    // ---- PhysicalRect basics ----

    #[test]
    fn new_clamps_negative_size() {
        let r = PhysicalRect::new(10, 10, -5, -1);
        assert_eq!((r.width, r.height), (0, 0));
        assert!(r.is_empty());
    }

    #[test]
    fn edges_are_half_open() {
        let r = PhysicalRect::new(-10, -20, 10, 20);
        assert_eq!((r.right(), r.bottom()), (0, 0));
        assert!(r.contains(pt(-10, -20)));
        assert!(r.contains(pt(-1, -1)));
        assert!(!r.contains(pt(0, -1)));
        assert!(!r.contains(pt(-1, 0)));
        assert!(!r.contains(pt(-11, -5)));
    }

    #[test]
    fn from_points_normalizes_any_drag_direction() {
        let expected = PhysicalRect::new(-100, -50, 150, 80);
        assert_eq!(
            PhysicalRect::from_points(pt(-100, -50), pt(50, 30)),
            expected
        );
        assert_eq!(
            PhysicalRect::from_points(pt(50, 30), pt(-100, -50)),
            expected
        );
        assert_eq!(
            PhysicalRect::from_points(pt(-100, 30), pt(50, -50)),
            expected
        );
        assert_eq!(
            PhysicalRect::from_points(pt(50, -50), pt(-100, 30)),
            expected
        );
    }

    #[test]
    fn from_points_same_point_is_empty() {
        assert!(PhysicalRect::from_points(pt(-3, -3), pt(-3, -3)).is_empty());
    }

    #[test]
    fn area_does_not_overflow_i32() {
        assert_eq!(
            PhysicalRect::new(0, 0, 100_000, 100_000).area(),
            10_000_000_000
        );
    }

    // ---- intersection / clamping ----

    #[test]
    fn intersect_overlapping_across_negative_origin() {
        let a = PhysicalRect::new(-100, -100, 150, 150);
        let b = PhysicalRect::new(0, 0, 100, 100);
        assert_eq!(a.intersect(&b), Some(PhysicalRect::new(0, 0, 50, 50)));
        assert_eq!(a.intersect(&b), b.intersect(&a));
    }

    #[test]
    fn intersect_touching_edges_is_none() {
        let left = PhysicalRect::new(-1920, 0, 1920, 1080);
        let right = PhysicalRect::new(0, 0, 1920, 1080);
        assert_eq!(left.intersect(&right), None);
    }

    #[test]
    fn intersect_disjoint_is_none() {
        let a = PhysicalRect::new(-500, -500, 10, 10);
        let b = PhysicalRect::new(500, 500, 10, 10);
        assert_eq!(a.intersect(&b), None);
    }

    #[test]
    fn intersect_contained_returns_inner() {
        let outer = PhysicalRect::new(-1000, -1000, 3000, 3000);
        let inner = PhysicalRect::new(-10, 5, 20, 30);
        assert_eq!(outer.intersect(&inner), Some(inner));
        assert!(outer.contains_rect(&inner));
        assert!(!inner.contains_rect(&outer));
    }

    #[test]
    fn clamp_selection_to_monitor_with_negative_origin() {
        let m = PhysicalRect::new(-1920, 400, 1920, 1080);
        // Selection dragged past the monitor's top-left and right edges.
        let sel = PhysicalRect::from_points(pt(-2000, 300), pt(100, 600));
        assert_eq!(
            sel.clamp_to(&m),
            Some(PhysicalRect::new(-1920, 400, 1920, 200))
        );
        // Entirely off-monitor.
        assert_eq!(PhysicalRect::new(0, 0, 10, 10).clamp_to(&m), None);
    }

    #[test]
    fn clamp_point_respects_exclusive_edges() {
        let m = PhysicalRect::new(-1920, 400, 1920, 1080);
        assert_eq!(m.clamp_point(pt(-5000, 0)), Some(pt(-1920, 400)));
        assert_eq!(m.clamp_point(pt(5000, 5000)), Some(pt(-1, 1479)));
        assert_eq!(m.clamp_point(pt(-100, 500)), Some(pt(-100, 500)));
        assert_eq!(PhysicalRect::default().clamp_point(pt(0, 0)), None);
    }

    #[test]
    fn union_ignores_empty() {
        let a = PhysicalRect::new(-10, -10, 5, 5);
        assert_eq!(a.union(&PhysicalRect::default()), a);
        assert_eq!(PhysicalRect::default().union(&a), a);
        let b = PhysicalRect::new(10, 10, 5, 5);
        assert_eq!(a.union(&b), PhysicalRect::new(-10, -10, 25, 25));
    }

    #[test]
    fn relative_to_monitor_origin_gives_buffer_coords() {
        let m = PhysicalRect::new(-1920, 400, 1920, 1080);
        let sel = PhysicalRect::new(-1900, 450, 100, 50);
        assert_eq!(
            sel.relative_to(m.origin()),
            PhysicalRect::new(20, 50, 100, 50)
        );
        assert_eq!(sel.relative_to(m.origin()).translate(m.x, m.y), sel);
    }

    // ---- monitors ----

    #[test]
    fn monitor_at_handles_negative_coords_and_gaps() {
        let ms = layout();
        assert_eq!(monitor_at(&ms, pt(-1, 500)).map(|m| m.index), Some(0));
        assert_eq!(monitor_at(&ms, pt(0, 0)).map(|m| m.index), Some(1));
        assert_eq!(monitor_at(&ms, pt(3840, -700)).map(|m| m.index), Some(2));
        // Above monitor 0 (which starts at y=400): a gap.
        assert_eq!(monitor_at(&ms, pt(-1, 0)).map(|m| m.index), None);
        // Boundary pixel belongs to the right-hand monitor only.
        assert_eq!(monitor_at(&ms, pt(3839, 0)).map(|m| m.index), Some(1));
    }

    #[test]
    fn virtual_bounds_spans_all_monitors() {
        assert_eq!(
            virtual_bounds(&layout()),
            PhysicalRect::from_ltrb(-1920, -700, 6400, 2160)
        );
        assert!(virtual_bounds(&[]).is_empty());
    }

    // ---- CSS ↔ physical ----

    #[test]
    fn css_to_physical_mixed_scale() {
        let ms = layout();
        let p = LogicalPoint { x: 100.0, y: 10.0 };
        assert_eq!(ms[0].css_to_physical(p), pt(-1920 + 100, 400 + 10));
        assert_eq!(ms[1].css_to_physical(p), pt(150, 15));
        assert_eq!(ms[2].css_to_physical(p), pt(3840 + 125, -700 + 12));
    }

    #[test]
    fn css_to_physical_floors_fractional_css() {
        let m = &layout()[1]; // 150%
                              // CSS 0.5 → 0.75 physical, still in pixel 0; CSS 0.7 → 1.05 → pixel 1.
        assert_eq!(m.css_to_physical(LogicalPoint { x: 0.5, y: 0.7 }), pt(0, 1));
    }

    #[test]
    fn css_physical_round_trip_every_pixel() {
        for scale in [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 3.0] {
            let m = monitor(0, PhysicalRect::new(-2561, -1001, 2560, 1440), scale);
            for x in (m.physical_bounds.left()..m.physical_bounds.right()).step_by(7) {
                let p = pt(x, m.physical_bounds.y + (x & 0xff));
                let css = m.physical_to_css(p);
                assert_eq!(m.css_to_physical(css), p, "scale {scale}, pixel {p:?}");
            }
        }
    }

    #[test]
    fn full_monitor_maps_to_its_css_viewport() {
        let ms = layout();
        let css = ms[1].physical_rect_to_css(&ms[1].physical_bounds);
        assert_eq!(
            css,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 2560.0,
                height: 1440.0
            }
        );
        let css = ms[2].physical_rect_to_css(&ms[2].physical_bounds);
        assert_eq!(
            css,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 2048.0,
                height: 1152.0
            }
        );
    }

    #[test]
    fn physical_rect_to_css_negative_origin() {
        let m = &layout()[0];
        let r = PhysicalRect::new(-1900, 450, 100, 50);
        assert_eq!(
            m.physical_rect_to_css(&r),
            LogicalRect {
                x: 20.0,
                y: 50.0,
                width: 100.0,
                height: 50.0
            }
        );
    }
}
