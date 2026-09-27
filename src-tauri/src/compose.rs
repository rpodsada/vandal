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

/// Copy `rect` (in `image` pixels) out of `image`. Parts outside are
/// transparent. `None` if `rect` is empty.
pub fn crop_rgba(image: &RgbaImage, rect: PhysicalRect) -> Option<RgbaImage> {
    if rect.is_empty() {
        return None;
    }
    let (w, h) = (rect.width as usize, rect.height as usize);
    let mut rgba = vec![0u8; w * h * 4];
    let bounds = PhysicalRect::new(0, 0, image.width as i32, image.height as i32);
    if let Some(overlap) = rect.intersect(&bounds) {
        let dst = overlap.relative_to(rect.origin());
        let row_bytes = overlap.width as usize * 4;
        for row in 0..overlap.height as usize {
            let s = ((overlap.y as usize + row) * image.width as usize + overlap.x as usize) * 4;
            let d = ((dst.y as usize + row) * w + dst.x as usize) * 4;
            rgba[d..d + row_bytes].copy_from_slice(&image.rgba[s..s + row_bytes]);
        }
    }
    Some(RgbaImage {
        width: w as u32,
        height: h as u32,
        rgba,
    })
}

fn check_size(base: &RgbaImage, layer: &[u8]) -> Result<(), String> {
    if layer.len() != base.rgba.len() {
        return Err(format!(
            "layer is {} bytes, expected {} for {}×{}",
            layer.len(),
            base.rgba.len(),
            base.width,
            base.height
        ));
    }
    Ok(())
}

/// Straight-alpha source-over of one pixel, `l` onto `b`.
fn over(b: &mut [u8], l: [u8; 4]) {
    let la = u32::from(l[3]);
    if la == 0 {
        return;
    }
    if la == 255 {
        b.copy_from_slice(&l);
        return;
    }
    let ba = u32::from(b[3]);
    // out_a = la + ba·(1 − la), all in 0..=255 fixed point (×255).
    let ba_rest = ba * (255 - la); // ×255²
    let out_a = la * 255 + ba_rest; // ×255²
    for c in 0..3 {
        let num = u32::from(l[c]) * la * 255 + u32::from(b[c]) * ba_rest;
        b[c] = ((num + out_a / 2) / out_a) as u8;
    }
    b[3] = ((out_a + 127) / 255) as u8;
}

/// Composite straight-alpha RGBA `layer` over `base` in place ("source over").
/// `layer` must be the same size as `base`.
pub fn blend_over(base: &mut RgbaImage, layer: &[u8]) -> Result<(), String> {
    check_size(base, layer)?;
    for (b, l) in base.rgba.chunks_exact_mut(4).zip(layer.chunks_exact(4)) {
        over(b, [l[0], l[1], l[2], l[3]]);
    }
    Ok(())
}

/// Composite straight-alpha RGBA `layer` onto `base` with the "multiply" blend
/// mode (W3C compositing, as CSS `mix-blend-mode: multiply` shows it on
/// screen): dark detail under a highlight stays dark. Over transparent base
/// pixels it falls back to plain source-over. Same size as `base`.
pub fn blend_multiply(base: &mut RgbaImage, layer: &[u8]) -> Result<(), String> {
    check_size(base, layer)?;
    for (b, l) in base.rgba.chunks_exact_mut(4).zip(layer.chunks_exact(4)) {
        if l[3] == 0 {
            continue;
        }
        // Mixed color: (1 − ba)·Cs + ba·Cb·Cs, then composited source-over.
        let ba = u32::from(b[3]);
        let mut mixed = [0, 0, 0, l[3]];
        for c in 0..3 {
            let cs = u32::from(l[c]);
            let num = cs * (255 - ba) * 255 + ba * u32::from(b[c]) * cs; // ×255²
            mixed[c] = ((num + 65025 / 2) / 65025) as u8;
        }
        over(b, mixed);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::{virtual_bounds, MonitorInfo};

    fn image(w: u32, h: u32, px: [u8; 4]) -> RgbaImage {
        RgbaImage {
            width: w,
            height: h,
            rgba: px.repeat((w * h) as usize),
        }
    }

    #[test]
    fn crop_rgba_copies_and_pads() {
        let mut img = image(3, 2, [0, 0, 0, 255]);
        img.rgba[(3 + 2) * 4] = 9; // pixel (2,1): (y·w + x)·4
        let c = crop_rgba(&img, PhysicalRect::new(2, 1, 2, 1)).unwrap();
        assert_eq!(c.rgba, vec![9, 0, 0, 255, 0, 0, 0, 0]);
        assert!(crop_rgba(&img, PhysicalRect::new(0, 0, 0, 1)).is_none());
    }

    #[test]
    fn blend_over_opaque_base() {
        let mut base = image(3, 1, [200, 100, 0, 255]);
        let layer = [
            [0, 0, 0, 0],         // transparent: base shows
            [10, 20, 30, 255],    // opaque: layer wins
            [255, 255, 255, 128], // half white over base
        ]
        .concat();
        blend_over(&mut base, &layer).unwrap();
        assert_eq!(&base.rgba[0..4], &[200, 100, 0, 255]);
        assert_eq!(&base.rgba[4..8], &[10, 20, 30, 255]);
        assert_eq!(&base.rgba[8..12], &[228, 178, 128, 255]);
    }

    #[test]
    fn blend_over_transparent_base_keeps_layer_color() {
        // Over a gap between monitors the result is the layer itself.
        let mut base = image(1, 1, [0, 0, 0, 0]);
        blend_over(&mut base, &[255, 0, 0, 100]).unwrap();
        assert_eq!(base.rgba, vec![255, 0, 0, 100]);
    }

    #[test]
    fn blend_multiply_darkens_and_keeps_white_neutral() {
        let mut base = image(3, 1, [200, 100, 0, 255]);
        let layer = [
            [255, 255, 255, 255], // white: no change
            [255, 235, 59, 255],  // highlighter yellow: base × yellow
            [0, 0, 0, 0],         // transparent: no change
        ]
        .concat();
        blend_multiply(&mut base, &layer).unwrap();
        assert_eq!(&base.rgba[0..4], &[200, 100, 0, 255]);
        assert_eq!(&base.rgba[4..8], &[200, 92, 0, 255]);
        assert_eq!(&base.rgba[8..12], &[200, 100, 0, 255]);
    }

    #[test]
    fn blend_multiply_half_alpha_goes_halfway() {
        let mut base = image(1, 1, [255, 255, 255, 255]);
        blend_multiply(&mut base, &[0, 0, 0, 128]).unwrap();
        assert_eq!(base.rgba, vec![127, 127, 127, 255]);
    }

    #[test]
    fn blend_multiply_transparent_base_is_source_over() {
        let mut base = image(1, 1, [0, 0, 0, 0]);
        blend_multiply(&mut base, &[255, 235, 59, 255]).unwrap();
        assert_eq!(base.rgba, vec![255, 235, 59, 255]);
    }

    #[test]
    fn blend_over_rejects_wrong_size() {
        let mut base = image(2, 2, [0, 0, 0, 255]);
        assert!(blend_over(&mut base, &[0; 4]).is_err());
        assert!(blend_multiply(&mut base, &[0; 4]).is_err());
    }

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
