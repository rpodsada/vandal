//! Build output images from captured frames.

use crate::capture::MonitorFrame;
use crate::geometry::PhysicalRect;

/// Straight (non-premultiplied) RGBA, top-down, stride = `width * 4`.
pub struct RgbaImage {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

/// Copy the virtual-desktop `rect` out of `frames`. Works for a region on one
/// monitor, a whole monitor, or a rect spanning several. Areas not covered by
/// any monitor (gaps in the layout) are transparent. `None` if `rect` is empty.
pub fn compose(frames: &[&MonitorFrame], rect: PhysicalRect) -> Option<RgbaImage> {
    if rect.is_empty() {
        return None;
    }
    let (w, h) = (rect.width as usize, rect.height as usize);
    let mut rgba = vec![0u8; w * h * 4];

    for frame in frames {
        let bounds = frame.monitor.physical_bounds;
        let Some(overlap) = rect.intersect(&bounds) else {
            continue;
        };
        let src = overlap.relative_to(bounds.origin());
        let dst = overlap.relative_to(rect.origin());
        let src_stride = frame.width as usize * 4;
        let row_bytes = overlap.width as usize * 4;
        for row in 0..overlap.height as usize {
            let s = (src.y as usize + row) * src_stride + src.x as usize * 4;
            let d = (dst.y as usize + row) * w * 4 + dst.x as usize * 4;
            let (src_row, dst_row) = (&frame.bgra[s..s + row_bytes], &mut rgba[d..d + row_bytes]);
            for (o, i) in dst_row.chunks_exact_mut(4).zip(src_row.chunks_exact(4)) {
                o.copy_from_slice(&[i[2], i[1], i[0], 0xFF]);
            }
        }
    }

    Some(RgbaImage {
        width: w as u32,
        height: h as u32,
        rgba,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::{virtual_bounds, MonitorInfo};

    /// A frame whose pixel at local (x, y) is BGRA = (x, y, index, 0).
    fn frame(index: u32, bounds: PhysicalRect) -> MonitorFrame {
        let mut bgra = Vec::new();
        for y in 0..bounds.height {
            for x in 0..bounds.width {
                bgra.extend_from_slice(&[x as u8, y as u8, index as u8, 0]);
            }
        }
        MonitorFrame {
            monitor: MonitorInfo {
                index,
                name: String::new(),
                physical_bounds: bounds,
                work_area: bounds,
                scale_factor: 1.0,
                is_primary: index == 0,
            },
            width: bounds.width as u32,
            height: bounds.height as u32,
            bgra,
        }
    }

    fn px(img: &RgbaImage, x: u32, y: u32) -> [u8; 4] {
        let i = ((y * img.width + x) * 4) as usize;
        img.rgba[i..i + 4].try_into().unwrap()
    }

    #[test]
    fn crops_region_and_swizzles_to_opaque_rgba() {
        let f = frame(7, PhysicalRect::new(0, 0, 10, 10));
        let img = compose(&[&f], PhysicalRect::new(2, 3, 4, 5)).unwrap();
        assert_eq!((img.width, img.height), (4, 5));
        // Local (2,3) → RGBA (index, y, x, 255).
        assert_eq!(px(&img, 0, 0), [7, 3, 2, 255]);
        assert_eq!(px(&img, 3, 4), [7, 7, 5, 255]);
    }

    #[test]
    fn crops_on_monitor_with_negative_origin() {
        let f = frame(1, PhysicalRect::new(-10, -20, 10, 20));
        let img = compose(&[&f], PhysicalRect::new(-4, -5, 2, 2)).unwrap();
        // Virtual (-4,-5) is local (6,15).
        assert_eq!(px(&img, 0, 0), [1, 15, 6, 255]);
    }

    #[test]
    fn stitches_across_monitors_with_transparent_gaps() {
        // Left monitor at y=0..4, right monitor offset down by 2: gap top-right.
        let left = frame(0, PhysicalRect::new(-4, 0, 4, 4));
        let right = frame(1, PhysicalRect::new(0, 2, 4, 4));
        let frames = [&left, &right];
        let all = virtual_bounds(&[left.monitor.clone(), right.monitor.clone()]);
        assert_eq!(all, PhysicalRect::new(-4, 0, 8, 6));
        let img = compose(&frames, all).unwrap();
        assert_eq!(px(&img, 0, 0), [0, 0, 0, 255]); // left local (0,0)
        assert_eq!(px(&img, 3, 3), [0, 3, 3, 255]); // left local (3,3)
        assert_eq!(px(&img, 4, 0), [0, 0, 0, 0]); // gap above right monitor
        assert_eq!(px(&img, 4, 2), [1, 0, 0, 255]); // right local (0,0)
        assert_eq!(px(&img, 0, 5), [0, 0, 0, 0]); // gap below left monitor
        assert_eq!(px(&img, 7, 5), [1, 3, 3, 255]); // right local (3,3)
    }

    #[test]
    fn rect_partly_off_screen_leaves_transparent_edge() {
        let f = frame(0, PhysicalRect::new(0, 0, 4, 4));
        let img = compose(&[&f], PhysicalRect::new(-1, 0, 2, 1)).unwrap();
        assert_eq!(px(&img, 0, 0), [0, 0, 0, 0]);
        assert_eq!(px(&img, 1, 0), [0, 0, 0, 255]);
    }

    #[test]
    fn empty_rect_is_none() {
        let f = frame(0, PhysicalRect::new(0, 0, 4, 4));
        assert!(compose(&[&f], PhysicalRect::new(1, 1, 0, 3)).is_none());
    }
}
