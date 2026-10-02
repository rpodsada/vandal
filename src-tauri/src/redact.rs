//! Redaction (PLAN 3D.3, 3I.2): cover rectangles of an image with solid black,
//! or pixelate or blur them, baked into the exported pixels so nothing can be
//! peeled off afterwards. Pixelate and blur can be partly reversed on text at
//! small strengths (Depix), so Solid is the default and Settings warns about
//! weak presets; they stay allowed, for a light effect.
//!
//! `src/markup/redact.ts` previews with exactly the same arithmetic (integer
//! averages, the same block grid and blur passes), so the export matches what
//! the page showed. Change both together; the tests share their cases.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::compose::RgbaImage;
use crate::geometry::PhysicalRect;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RedactMode {
    /// Opaque black: nothing of the original survives.
    Solid,
    Pixelate,
    Blur,
}

/// One redaction, in the base image's pixels.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Redaction {
    pub rect: PhysicalRect,
    pub mode: RedactMode,
    /// Pixelate: block size. Blur: box radius (three passes). Source px.
    /// Solid: unused.
    pub strength: u32,
}

/// Smallest pixelate block and blur radius that still change anything.
const MIN_BLOCK: u32 = 2;
const MIN_RADIUS: u32 = 1;
/// What Solid covers with.
const SOLID: [u8; 4] = [0, 0, 0, 255];
/// Box blur passes (three approximate a Gaussian).
const PASSES: usize = 3;

/// Apply `redactions` (base-image px, in order) to `out`, which is `crop` of
/// `base`. Each one is worked out from `base` itself, so the pixels around it
/// feed the blur even outside the crop, and a later redaction over an earlier
/// one shows the original under it, as in the preview.
pub fn apply(base: &RgbaImage, crop: PhysicalRect, out: &mut RgbaImage, redactions: &[Redaction]) {
    let bounds = PhysicalRect::new(0, 0, base.width as i32, base.height as i32);
    for r in redactions {
        let Some(region) = r.rect.intersect(&bounds) else {
            continue;
        };
        let Some(visible) = region.intersect(&crop) else {
            continue;
        };
        let pixels = redacted(base, region, r.mode, r.strength);
        for y in visible.y..visible.y + visible.height {
            let src = (((y - region.y) * region.width + (visible.x - region.x)) * 4) as usize;
            let dst = (((y - crop.y) * crop.width + (visible.x - crop.x)) * 4) as usize;
            let len = (visible.width * 4) as usize;
            out.rgba[dst..dst + len].copy_from_slice(&pixels[src..src + len]);
        }
    }
}

/// The pixels of `region` (inside `image`) redacted: RGBA, row by row.
pub fn redacted(
    image: &RgbaImage,
    region: PhysicalRect,
    mode: RedactMode,
    strength: u32,
) -> Vec<u8> {
    match mode {
        RedactMode::Solid => SOLID.repeat((region.width * region.height) as usize),
        RedactMode::Pixelate => pixelate(image, region, strength.max(MIN_BLOCK)),
        RedactMode::Blur => blur(image, region, strength.max(MIN_RADIUS)),
    }
}

fn pixel_index(image: &RgbaImage, x: i32, y: i32) -> usize {
    ((y as usize) * image.width as usize + x as usize) * 4
}

/// Blocks of `block` px from the region's top-left, each the rounded average
/// of its pixels (the last row and column of blocks may be smaller).
fn pixelate(image: &RgbaImage, region: PhysicalRect, block: u32) -> Vec<u8> {
    let (w, h) = (region.width as usize, region.height as usize);
    let block = block as usize;
    let mut out = vec![0u8; w * h * 4];
    for by in (0..h).step_by(block) {
        for bx in (0..w).step_by(block) {
            let (bw, bh) = (block.min(w - bx), block.min(h - by));
            let mut sum = [0u64; 4];
            for y in by..by + bh {
                for x in bx..bx + bw {
                    let i = pixel_index(image, region.x + x as i32, region.y + y as i32);
                    for (s, &v) in sum.iter_mut().zip(&image.rgba[i..i + 4]) {
                        *s += u64::from(v);
                    }
                }
            }
            let n = (bw * bh) as u64;
            let avg = sum.map(|s| ((s + n / 2) / n) as u8);
            for y in by..by + bh {
                for x in bx..bx + bw {
                    let i = (y * w + x) * 4;
                    out[i..i + 4].copy_from_slice(&avg);
                }
            }
        }
    }
    out
}

/// Three box-blur passes of `radius` (each horizontal, then vertical) over the
/// region plus the margin the passes reach, clamped at the image's edges.
fn blur(image: &RgbaImage, region: PhysicalRect, radius: u32) -> Vec<u8> {
    let margin = (radius as usize * PASSES) as i32;
    let bounds = PhysicalRect::new(0, 0, image.width as i32, image.height as i32);
    let work = PhysicalRect::new(
        region.x - margin,
        region.y - margin,
        region.width + 2 * margin,
        region.height + 2 * margin,
    )
    .intersect(&bounds)
    .unwrap_or(region);
    let (w, h) = (work.width as usize, work.height as usize);
    let mut buf = Vec::with_capacity(w * h * 4);
    for y in work.y..work.y + work.height {
        let i = pixel_index(image, work.x, y);
        buf.extend_from_slice(&image.rgba[i..i + w * 4]);
    }
    let mut line = Vec::new();
    for _ in 0..PASSES {
        for y in 0..h {
            box_pass(&mut buf, y * w * 4, 4, w, radius as usize, &mut line);
        }
        for x in 0..w {
            box_pass(&mut buf, x * 4, w * 4, h, radius as usize, &mut line);
        }
    }
    let (ox, oy) = ((region.x - work.x) as usize, (region.y - work.y) as usize);
    let rw = region.width as usize;
    let mut out = Vec::with_capacity(rw * region.height as usize * 4);
    for y in oy..oy + region.height as usize {
        let i = (y * w + ox) * 4;
        out.extend_from_slice(&buf[i..i + rw * 4]);
    }
    out
}

/// One box blur along `n` pixels of `buf` starting at `start`, `stride` bytes
/// apart: each becomes the rounded mean of the `2r + 1` around it, with the
/// ends repeated past the edges.
fn box_pass(buf: &mut [u8], start: usize, stride: usize, n: usize, r: usize, line: &mut Vec<u8>) {
    line.clear();
    line.extend((0..n).flat_map(|i| {
        let p = start + i * stride;
        [buf[p], buf[p + 1], buf[p + 2], buf[p + 3]]
    }));
    let d = (2 * r + 1) as u32;
    let at = |i: isize, c: usize| u32::from(line[(i.clamp(0, n as isize - 1) as usize) * 4 + c]);
    for c in 0..4 {
        let mut sum: u32 = (-(r as isize)..=r as isize).map(|k| at(k, c)).sum();
        for i in 0..n {
            buf[start + i * stride + c] = ((sum + d / 2) / d) as u8;
            sum += at(i as isize + r as isize + 1, c);
            sum -= at(i as isize - r as isize, c);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A `w`×`h` image whose red channel is `f(x, y)`, the rest fixed.
    fn image(w: u32, h: u32, f: impl Fn(u32, u32) -> u8) -> RgbaImage {
        let mut rgba = Vec::new();
        for y in 0..h {
            for x in 0..w {
                rgba.extend_from_slice(&[f(x, y), 10, 20, 255]);
            }
        }
        RgbaImage {
            width: w,
            height: h,
            rgba,
        }
    }

    fn reds(pixels: &[u8]) -> Vec<u8> {
        pixels.chunks_exact(4).map(|p| p[0]).collect()
    }

    // The same cases as `src/markup/redact.test.ts`.

    #[test]
    fn pixelate_averages_blocks_from_the_region_corner() {
        let img = image(5, 3, |x, y| (x * 10 + y * 100) as u8);
        let region = PhysicalRect::new(1, 0, 3, 3);
        let out = pixelate(&img, region, 2);
        // Blocks: x 1–2 and 3, y 0–1 and 2. Rounded means.
        assert_eq!(
            reds(&out),
            [65, 65, 80, 65, 65, 80, 215, 215, 230],
            "red channel"
        );
        assert!(out.chunks_exact(4).all(|p| p[1..] == [10, 20, 255]));
    }

    #[test]
    fn blur_matches_the_preview() {
        let img = image(6, 1, |x, _| if x == 2 { 255 } else { 0 });
        let out = blur(&img, PhysicalRect::new(0, 0, 6, 1), 1);
        assert_eq!(reds(&out), [38, 57, 66, 57, 28, 9]);
        // Flat channels stay flat.
        assert!(out.chunks_exact(4).all(|p| p[1..] == [10, 20, 255]));
    }

    #[test]
    fn blur_reads_pixels_around_the_region() {
        // A bright column just outside the region still bleeds in.
        let img = image(4, 1, |x, _| if x == 0 { 255 } else { 0 });
        let out = blur(&img, PhysicalRect::new(1, 0, 2, 1), 1);
        assert_eq!(reds(&out), [85, 38]);
    }

    #[test]
    fn apply_pastes_only_inside_the_crop_and_image() {
        let base = image(4, 4, |x, y| (x + 4 * y) as u8 * 10);
        let crop = PhysicalRect::new(1, 1, 2, 2);
        let mut out = crate::compose::crop_rgba(&base, crop).unwrap();
        let before = out.rgba.clone();
        apply(
            &base,
            crop,
            &mut out,
            &[Redaction {
                // Hangs off the image's left edge and covers the crop's left column.
                rect: PhysicalRect::new(-3, 0, 5, 4),
                mode: RedactMode::Pixelate,
                strength: 8,
            }],
        );
        // Region x 0–1 of the image, one block: the rounded mean of
        // 0, 10, 40, 50, 80, 90, 120 and 130.
        let mean = 65;
        assert_eq!(reds(&out.rgba), [mean, before[4], mean, before[12]]);
    }

    #[test]
    fn tiny_strengths_are_raised() {
        let img = image(2, 1, |x, _| x as u8 * 100);
        let region = PhysicalRect::new(0, 0, 2, 1);
        let out = redacted(&img, region, RedactMode::Pixelate, 0);
        assert_eq!(reds(&out), [50, 50]);
        assert_eq!(
            redacted(&img, region, RedactMode::Blur, 0),
            blur(&img, region, MIN_RADIUS)
        );
    }

    #[test]
    fn solid_covers_black() {
        let img = image(3, 2, |x, _| x as u8 * 50);
        let out = redacted(&img, PhysicalRect::new(1, 0, 2, 2), RedactMode::Solid, 0);
        assert_eq!(out, [0, 0, 0, 255].repeat(4));
    }
}
