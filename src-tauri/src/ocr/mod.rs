//! Text recognition behind a trait (PLAN §1, 3J), for redacting selected text.
//!
//! The engine finds lines of words in an image; the page turns a selection of
//! them into ordinary redactions. Only word boxes and text cross IPC, never
//! pixels. The Windows engine is in [`winrt`]; everything here is pure.

pub mod winrt;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::compose::RgbaImage;
use crate::geometry::PhysicalRect;

/// One recognized word, its box in the image's pixels (rounded outward, so
/// it covers all of the word's ink).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OcrWord {
    pub text: String,
    pub rect: PhysicalRect,
}

/// Words in reading order. Lines come in the engine's order, which keeps
/// columns together.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    pub words: Vec<OcrWord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OcrError {
    /// Windows has no OCR language installed that it can use.
    NoLanguage,
    Failed {
        message: String,
    },
}

impl OcrError {
    pub fn failed(e: impl std::fmt::Display) -> Self {
        Self::Failed {
            message: e.to_string(),
        }
    }
}

pub trait TextRecognizer: Send + Sync {
    fn name(&self) -> &'static str;

    /// The lines of text in `image`, in its pixels. Blocking (tens of ms for
    /// a screenshot), so call it off the main thread.
    fn recognize(&self, image: &RgbaImage) -> Result<Vec<OcrLine>, OcrError>;
}

/// A word box as an engine reports it: fractional, in the pixels it was given.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RawBox {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// How the image the engine saw relates to ours: scaled by `scale` per axis
/// (0.5 when halved to fit), then placed at `offset` (padded to a minimum).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
    pub scale: (f64, f64),
    pub offset: (u32, u32),
}

#[cfg(test)]
impl Placement {
    pub const IDENTITY: Self = Self {
        scale: (1.0, 1.0),
        offset: (0, 0),
    };
}

/// `raw` back in the original image's pixels, rounded outward.
pub fn to_image_rect(raw: RawBox, at: Placement) -> PhysicalRect {
    let x = |v: f32| (f64::from(v) - f64::from(at.offset.0)) / at.scale.0;
    let y = |v: f32| (f64::from(v) - f64::from(at.offset.1)) / at.scale.1;
    let (x0, y0) = (x(raw.x).floor() as i32, y(raw.y).floor() as i32);
    let x1 = x(raw.x + raw.width).ceil() as i32;
    let y1 = y(raw.y + raw.height).ceil() as i32;
    PhysicalRect::new(x0, y0, x1 - x0, y1 - y0)
}

/// `image` centred on a canvas at least `min` px each way, filled with its
/// top-left pixel's colour, and where it went. `None` if it's big enough.
/// (Windows' OCR finds nothing in an image under 40 px either way, such as
/// a quick edit selection around one line of text.)
pub fn pad_to(image: &RgbaImage, min: u32) -> Option<(RgbaImage, (u32, u32))> {
    if image.width >= min && image.height >= min {
        return None;
    }
    let (w, h) = (image.width.max(min), image.height.max(min));
    let offset = ((w - image.width) / 2, (h - image.height) / 2);
    let fill = image
        .rgba
        .get(..4)
        .map_or([255; 4], |p| [p[0], p[1], p[2], 255]);
    let mut rgba = fill.repeat((w * h) as usize);
    let row = image.width as usize * 4;
    for y in 0..image.height as usize {
        let s = y * row;
        let d = ((y + offset.1 as usize) * w as usize + offset.0 as usize) * 4;
        rgba[d..d + row].copy_from_slice(&image.rgba[s..s + row]);
    }
    Some((
        RgbaImage {
            width: w,
            height: h,
            rgba,
        },
        offset,
    ))
}

/// Lines from an engine's raw words, dropping empty words and lines.
pub fn build_lines(raw: Vec<Vec<(String, RawBox)>>, at: Placement) -> Vec<OcrLine> {
    raw.into_iter()
        .map(|words| OcrLine {
            words: words
                .into_iter()
                .filter(|(text, b)| !text.trim().is_empty() && b.width > 0.0 && b.height > 0.0)
                .map(|(text, b)| OcrWord {
                    text,
                    rect: to_image_rect(b, at),
                })
                .collect(),
        })
        .filter(|line| !line.words.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(x: f32, y: f32, width: f32, height: f32) -> RawBox {
        RawBox {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn rects_round_outward() {
        let r = to_image_rect(raw(10.4, 20.6, 5.2, 3.1), Placement::IDENTITY);
        assert_eq!(r, PhysicalRect::new(10, 20, 6, 4));
    }

    #[test]
    fn rects_go_back_to_the_image() {
        // Found in a half-size copy: double everything.
        let half = Placement {
            scale: (0.5, 0.5),
            offset: (0, 0),
        };
        let r = to_image_rect(raw(10.0, 5.0, 4.0, 2.0), half);
        assert_eq!(r, PhysicalRect::new(20, 10, 8, 4));
        // Found on a padded canvas: take the padding off.
        let padded = Placement {
            scale: (1.0, 1.0),
            offset: (3, 9),
        };
        let r = to_image_rect(raw(10.0, 12.0, 4.0, 2.0), padded);
        assert_eq!(r, PhysicalRect::new(7, 3, 4, 2));
    }

    #[test]
    fn small_images_are_padded_with_their_corner_colour() {
        let image = RgbaImage {
            width: 2,
            height: 1,
            rgba: vec![10, 20, 30, 0, 99, 99, 99, 255],
        };
        let (padded, offset) = pad_to(&image, 4).unwrap();
        assert_eq!((padded.width, padded.height, offset), (4, 4, (1, 1)));
        let px = |x: usize, y: usize| &padded.rgba[(y * 4 + x) * 4..(y * 4 + x) * 4 + 4];
        assert_eq!(px(0, 0), [10, 20, 30, 255]);
        assert_eq!(px(1, 1), [10, 20, 30, 0]);
        assert_eq!(px(2, 1), [99, 99, 99, 255]);
        assert!(pad_to(&padded, 4).is_none());
    }

    #[test]
    fn empty_words_and_lines_are_dropped() {
        let lines = build_lines(
            vec![
                vec![
                    ("Hello".into(), raw(0.0, 0.0, 30.0, 10.0)),
                    (" ".into(), raw(31.0, 0.0, 3.0, 10.0)),
                    ("zero".into(), raw(40.0, 0.0, 0.0, 10.0)),
                ],
                vec![(String::new(), raw(0.0, 20.0, 5.0, 5.0))],
            ],
            Placement::IDENTITY,
        );
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].words.len(), 1);
        assert_eq!(lines[0].words[0].text, "Hello");
    }
}
