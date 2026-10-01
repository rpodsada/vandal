//! A crisp cutout of a captured window (PLAN 3H.3). WGC's frame holds more
//! than the window: a maximized window comes with a fully transparent margin
//! (the part that hangs off the screen), a Windows 11 window with its 1 px
//! semi-transparent border, and the rounded corners hold the faint edge of
//! the drop shadow. Each is detected from the pixels, so square, maximized
//! and Windows 10 windows come through untouched.

use super::WindowImage;

/// Windows 11's corner radius in logical px, the border included.
const CORNER_RADIUS: f64 = 8.0;

/// Clean `image` (straight-alpha BGRA) in place. Returns how far its top-left
/// corner moved, in px, so its position on the desktop can follow.
pub fn clean(image: &mut WindowImage, scale_factor: f64) -> (i32, i32) {
    let (mut dx, mut dy) = trim_transparent(image);
    if has_border(image) {
        crop(image, 1, 1, image.width - 2, image.height - 2);
        dx += 1;
        dy += 1;
    }
    let radius = CORNER_RADIUS * scale_factor - 1.0;
    if radius > 0.0 && corners_open(image) {
        round_corners(image, radius);
    }
    (dx, dy)
}

fn alpha(image: &WindowImage, x: u32, y: u32) -> u8 {
    image.bgra[((y * image.width + x) * 4 + 3) as usize]
}

/// Drop fully transparent rows and columns at the edges.
fn trim_transparent(image: &mut WindowImage) -> (i32, i32) {
    let (w, h) = (image.width, image.height);
    let row_clear = |y: u32| (0..w).all(|x| alpha(image, x, y) == 0);
    let col_clear = |x: u32| (0..h).all(|y| alpha(image, x, y) == 0);
    let top = (0..h).find(|&y| !row_clear(y));
    let Some(top) = top else {
        return (0, 0); // nothing visible: leave it
    };
    let bottom = (0..h).rev().find(|&y| !row_clear(y)).unwrap_or(top);
    let left = (0..w).find(|&x| !col_clear(x)).unwrap_or(0);
    let right = (0..w).rev().find(|&x| !col_clear(x)).unwrap_or(left);
    if (left, top, right, bottom) != (0, 0, w - 1, h - 1) {
        crop(image, left, top, right - left + 1, bottom - top + 1);
    }
    (left as i32, top as i32)
}

/// Windows 11's border: every edge's midpoint is semi-transparent.
fn has_border(image: &WindowImage) -> bool {
    let (w, h) = (image.width, image.height);
    w > 2
        && h > 2
        && [(w / 2, 0), (w / 2, h - 1), (0, h / 2), (w - 1, h / 2)]
            .iter()
            .all(|&(x, y)| alpha(image, x, y) < 255)
}

/// Rounded: a corner pixel isn't opaque.
fn corners_open(image: &WindowImage) -> bool {
    let (w, h) = (image.width, image.height);
    [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
        .iter()
        .any(|&(x, y)| alpha(image, x, y) < 255)
}

fn crop(image: &mut WindowImage, x: u32, y: u32, width: u32, height: u32) {
    let stride = image.width as usize * 4;
    let row = width as usize * 4;
    let mut out = Vec::with_capacity(row * height as usize);
    for r in y..y + height {
        let start = r as usize * stride + x as usize * 4;
        out.extend_from_slice(&image.bgra[start..start + row]);
    }
    image.bgra = out;
    image.width = width;
    image.height = height;
}

/// Antialiased rounded corners of `radius` px: outside the curve is fully
/// transparent, inside fully opaque. Pixels on the curve take their colour
/// from the first opaque pixel toward the corner's centre, so the border and
/// shadow mixed into them don't tint the edge.
fn round_corners(image: &mut WindowImage, radius: f64) {
    let (w, h) = (image.width, image.height);
    let size = (radius.ceil() as u32).min(w / 2).min(h / 2);
    let original = image.bgra.clone();
    let opaque = |x: u32, y: u32| original[((y * w + x) * 4 + 3) as usize] == 255;
    // Each corner as (x of its square's first column, y of first row, which
    // way is inward).
    let corners = [
        (0, 0, 1i32, 1i32),
        (w - size, 0, -1, 1),
        (0, h - size, 1, -1),
        (w - size, h - size, -1, -1),
    ];
    for (cx0, cy0, ix, iy) in corners {
        // The circle's centre, in pixel-edge coordinates.
        let centre_x = if ix > 0 {
            radius
        } else {
            f64::from(w) - radius
        };
        let centre_y = if iy > 0 {
            radius
        } else {
            f64::from(h) - radius
        };
        for y in cy0..cy0 + size {
            for x in cx0..cx0 + size {
                let (px, py) = (f64::from(x) + 0.5, f64::from(y) + 0.5);
                // Only the part beyond the centre, toward the corner, is curved.
                let outward_x = (px - centre_x) * f64::from(-ix) > 0.0;
                let outward_y = (py - centre_y) * f64::from(-iy) > 0.0;
                if !(outward_x && outward_y) {
                    continue;
                }
                let d = (px - centre_x).hypot(py - centre_y);
                let coverage = (radius - d + 0.5).clamp(0.0, 1.0);
                let i = ((y * w + x) * 4) as usize;
                if coverage <= 0.0 {
                    image.bgra[i..i + 4].fill(0);
                    continue;
                }
                if !opaque(x, y) {
                    // Walk toward the centre to the first opaque pixel.
                    let (dx, dy) = (centre_x - px, centre_y - py);
                    let steps = d.ceil() as i32;
                    for s in 1..=steps {
                        let t = f64::from(s) / f64::from(steps);
                        let sx = (px + dx * t).floor() as u32;
                        let sy = (py + dy * t).floor() as u32;
                        if sx < w && sy < h && opaque(sx, sy) {
                            let j = ((sy * w + sx) * 4) as usize;
                            image.bgra[i..i + 3].copy_from_slice(&original[j..j + 3]);
                            break;
                        }
                    }
                }
                image.bgra[i + 3] = (coverage * 255.0).round() as u8;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    /// A `w`×`h` window of opaque `content` with a `margin` of transparency
    /// and, if `border`, a 1 px semi-transparent grey ring inside it.
    fn window(w: u32, h: u32, margin: u32, border: bool, content: [u8; 4]) -> WindowImage {
        let mut bgra = Vec::new();
        for y in 0..h {
            for x in 0..w {
                let inside = |m: u32| x >= m && y >= m && x < w - m && y < h - m;
                let px = if !inside(margin) {
                    [0, 0, 0, 0]
                } else if border && !inside(margin + 1) {
                    [84, 84, 84, 150]
                } else {
                    content
                };
                bgra.extend_from_slice(&px);
            }
        }
        WindowImage {
            width: w,
            height: h,
            bgra,
            frames: 1,
            settle: Duration::ZERO,
        }
    }

    /// Real rounded windows have shadow, not content, in their corner pixels.
    fn shade_corners(image: &mut WindowImage, inset: u32) {
        let (w, h) = (image.width, image.height);
        for (x, y) in [
            (inset, inset),
            (w - 1 - inset, inset),
            (inset, h - 1 - inset),
            (w - 1 - inset, h - 1 - inset),
        ] {
            let i = ((y * w + x) * 4) as usize;
            image.bgra[i..i + 4].copy_from_slice(&[0, 0, 0, 40]);
        }
    }

    fn px(image: &WindowImage, x: u32, y: u32) -> [u8; 4] {
        let i = ((y * image.width + x) * 4) as usize;
        image.bgra[i..i + 4].try_into().unwrap()
    }

    const CONTENT: [u8; 4] = [33, 32, 31, 255];

    #[test]
    fn leaves_a_square_opaque_window_alone() {
        let mut image = window(40, 30, 0, false, CONTENT);
        let before = image.bgra.clone();
        assert_eq!(clean(&mut image, 1.0), (0, 0));
        assert_eq!((image.width, image.height), (40, 30));
        assert_eq!(image.bgra, before);
    }

    #[test]
    fn trims_a_maximized_windows_margin() {
        let mut image = window(56, 46, 8, false, CONTENT);
        assert_eq!(clean(&mut image, 1.0), (8, 8));
        assert_eq!((image.width, image.height), (40, 30));
        assert_eq!(px(&image, 0, 0), CONTENT);
    }

    #[test]
    fn removes_the_border_and_rounds_the_corners() {
        let mut image = window(42, 32, 0, true, CONTENT);
        shade_corners(&mut image, 1);
        assert_eq!(clean(&mut image, 1.0), (1, 1));
        assert_eq!((image.width, image.height), (40, 30));
        // Radius 7: the corner pixel is outside the curve, the edge middles
        // and the centre are untouched.
        assert_eq!(px(&image, 0, 0), [0, 0, 0, 0]);
        assert_eq!(px(&image, 39, 29), [0, 0, 0, 0]);
        assert_eq!(px(&image, 20, 0), CONTENT);
        assert_eq!(px(&image, 0, 15), CONTENT);
        assert_eq!(px(&image, 7, 7), CONTENT);
        // On the curve: partly covered, in the content's colour.
        let edge = px(&image, 4, 0);
        assert_eq!(&edge[..3], &CONTENT[..3]);
        assert!(edge[3] > 0 && edge[3] < 255, "{edge:?}");
    }

    #[test]
    fn corners_scale_with_the_monitor() {
        let mut image = window(82, 62, 0, true, CONTENT);
        shade_corners(&mut image, 1);
        clean(&mut image, 2.0);
        // Radius 15: (3, 3) is outside at 2×, though it would be inside at 1×.
        assert_eq!(px(&image, 3, 3)[3], 0);
        assert_eq!(px(&image, 6, 6), CONTENT);
    }

    #[test]
    fn rounds_curve_pixels_that_were_tinted() {
        // A rounded window whose curve pixels came mixed with the shadow.
        let mut image = window(40, 30, 0, false, CONTENT);
        let i = 4 * 4;
        image.bgra[i..i + 4].copy_from_slice(&[90, 90, 90, 120]);
        image.bgra[3] = 35; // the corner pixel: shadow
        clean(&mut image, 1.0);
        assert_eq!(&px(&image, 4, 0)[..3], &CONTENT[..3]);
        assert_eq!(px(&image, 0, 0), [0, 0, 0, 0]);
    }
}
