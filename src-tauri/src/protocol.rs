//! `capture://` custom URI scheme (served as `http://capture.localhost/` on
//! Windows). Moves frame pixels to the webview without JSON/base64 IPC.
//!
//! `GET /frame/{capture_id}/{monitor_index}?fmt=rgba|bmp`

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use crate::capture::MonitorFrame;
use crate::state::AppState;

pub const SCHEME: &str = "capture";

/// How frame pixels are encoded for the overlay (benchmarked in docs/perf.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum TransferFormat {
    /// Raw RGBA bytes → `putImageData`.
    Rgba,
    /// Uncompressed 32bpp BMP → `createImageBitmap`.
    Bmp,
}

impl TransferFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Rgba => "rgba",
            Self::Bmp => "bmp",
        }
    }
}

pub fn frame_url(capture_id: u32, monitor_index: u32, format: TransferFormat) -> String {
    format!(
        "http://{SCHEME}.localhost/frame/{capture_id}/{monitor_index}?fmt={}",
        format.as_str()
    )
}

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let Some((capture_id, monitor_index, format)) = parse(request.uri()) else {
        responder.respond(error(StatusCode::BAD_REQUEST));
        return;
    };
    let frame = ctx
        .app_handle()
        .state::<AppState>()
        .frames
        .lock()
        .unwrap()
        .frame(capture_id, monitor_index);
    let Some(frame) = frame else {
        responder.respond(error(StatusCode::NOT_FOUND));
        return;
    };
    // Encode off the webview's thread.
    std::thread::spawn(move || {
        let (body, content_type) = match format {
            TransferFormat::Rgba => (bgra_to_rgba(&frame.bgra), "application/octet-stream"),
            TransferFormat::Bmp => (encode_bmp(&frame), "image/bmp"),
        };
        responder.respond(
            Response::builder()
                .header(header::CONTENT_TYPE, content_type)
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header(header::CACHE_CONTROL, "no-store")
                .body(body)
                .unwrap(),
        );
    });
}

fn error(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Vec::new())
        .unwrap()
}

fn parse(uri: &tauri::http::Uri) -> Option<(u32, u32, TransferFormat)> {
    let mut parts = uri.path().trim_start_matches('/').split('/');
    if parts.next()? != "frame" {
        return None;
    }
    let capture_id = parts.next()?.parse().ok()?;
    let monitor_index = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    let format = match uri.query().unwrap_or("fmt=rgba") {
        "fmt=rgba" => TransferFormat::Rgba,
        "fmt=bmp" => TransferFormat::Bmp,
        _ => return None,
    };
    Some((capture_id, monitor_index, format))
}

/// BGRA (alpha undefined) → RGBA with alpha forced opaque.
pub fn bgra_to_rgba(bgra: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; bgra.len()];
    for (dst, src) in out.chunks_exact_mut(4).zip(bgra.chunks_exact(4)) {
        let v = u32::from_le_bytes([src[0], src[1], src[2], src[3]]);
        // Swap bytes 0 and 2, set alpha to 0xFF. Written as u32 ops so it vectorizes.
        let swapped = (v & 0x0000_FF00) | ((v >> 16) & 0xFF) | ((v & 0xFF) << 16) | 0xFF00_0000;
        dst.copy_from_slice(&swapped.to_le_bytes());
    }
    out
}

const BMP_FILE_HEADER: usize = 14;
const BMP_INFO_HEADER: usize = 40;

/// Top-down 32bpp `BI_RGB` BMP. Alpha is forced opaque since decoders differ on
/// whether they honour the 4th byte of a `BI_RGB` bitmap.
pub fn encode_bmp(frame: &MonitorFrame) -> Vec<u8> {
    let offset = BMP_FILE_HEADER + BMP_INFO_HEADER;
    let mut out = Vec::with_capacity(offset + frame.bgra.len());
    // BITMAPFILEHEADER
    out.extend_from_slice(b"BM");
    out.extend_from_slice(&((offset + frame.bgra.len()) as u32).to_le_bytes());
    out.extend_from_slice(&[0; 4]);
    out.extend_from_slice(&(offset as u32).to_le_bytes());
    // BITMAPINFOHEADER
    out.extend_from_slice(&(BMP_INFO_HEADER as u32).to_le_bytes());
    out.extend_from_slice(&(frame.width as i32).to_le_bytes());
    out.extend_from_slice(&(-(frame.height as i32)).to_le_bytes()); // top-down
    out.extend_from_slice(&1u16.to_le_bytes()); // planes
    out.extend_from_slice(&32u16.to_le_bytes()); // bpp
    out.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
    out.extend_from_slice(&(frame.bgra.len() as u32).to_le_bytes());
    out.extend_from_slice(&[0; 16]); // resolution, palette
                                     // Pixels
    out.extend(
        frame
            .bgra
            .chunks_exact(4)
            .flat_map(|p| [p[0], p[1], p[2], 0xFF]),
    );
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::{MonitorInfo, PhysicalRect};

    #[test]
    fn rgba_swizzle_and_opaque_alpha() {
        let bgra = [1, 2, 3, 0, 10, 20, 30, 77];
        assert_eq!(bgra_to_rgba(&bgra), vec![3, 2, 1, 255, 30, 20, 10, 255]);
    }

    #[test]
    fn bmp_header_layout() {
        let frame = MonitorFrame {
            monitor: MonitorInfo {
                index: 0,
                name: String::new(),
                physical_bounds: PhysicalRect::new(0, 0, 2, 1),
                work_area: PhysicalRect::new(0, 0, 2, 1),
                scale_factor: 1.0,
                is_primary: true,
            },
            width: 2,
            height: 1,
            bgra: vec![1, 2, 3, 0, 4, 5, 6, 0],
        };
        let bmp = encode_bmp(&frame);
        assert_eq!(bmp.len(), 54 + 8);
        assert_eq!(&bmp[0..2], b"BM");
        assert_eq!(u32::from_le_bytes(bmp[2..6].try_into().unwrap()), 62);
        assert_eq!(u32::from_le_bytes(bmp[10..14].try_into().unwrap()), 54);
        assert_eq!(i32::from_le_bytes(bmp[18..22].try_into().unwrap()), 2);
        assert_eq!(i32::from_le_bytes(bmp[22..26].try_into().unwrap()), -1);
        assert_eq!(u16::from_le_bytes(bmp[28..30].try_into().unwrap()), 32);
        assert_eq!(&bmp[54..], &[1, 2, 3, 255, 4, 5, 6, 255]);
    }

    #[test]
    fn parses_frame_urls() {
        let uri: tauri::http::Uri = frame_url(7, 2, TransferFormat::Bmp).parse().unwrap();
        assert_eq!(parse(&uri), Some((7, 2, TransferFormat::Bmp)));
        let uri: tauri::http::Uri = "capture://localhost/frame/1/0".parse().unwrap();
        assert_eq!(parse(&uri), Some((1, 0, TransferFormat::Rgba)));
        for bad in [
            "http://capture.localhost/frame/1",
            "http://capture.localhost/frame/x/0",
            "http://capture.localhost/frame/1/0/extra",
            "http://capture.localhost/other/1/0",
            "http://capture.localhost/frame/1/0?fmt=png",
        ] {
            assert_eq!(parse(&bad.parse().unwrap()), None, "{bad}");
        }
    }
}
