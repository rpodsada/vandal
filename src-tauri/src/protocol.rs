//! `capture://` custom URI scheme (served as `http://capture.localhost/` on
//! Windows). Moves frame pixels to the webview without JSON/base64 IPC.
//!
//! - `GET /frame/{capture_id}/{monitor_index}?fmt=rgba|bmp`: a monitor frame (overlay)
//! - `GET /editor/{editor_id}`: an editor's base image, raw RGBA
//! - `POST /editor/{editor_id}/layer`, `…/highlights`: the editor's annotation
//!   and highlight layers for the next export, raw straight-alpha RGBA of the
//!   crop's size

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use crate::capture::MonitorFrame;
use crate::editor::{EditorId, LayerKind};
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

pub fn editor_url(editor_id: EditorId) -> String {
    format!("http://{SCHEME}.localhost/editor/{editor_id}")
}

/// Where quick edit POSTs a capture's annotation or highlight layer.
pub fn capture_layer_url(capture_id: u32, kind: LayerKind) -> String {
    format!(
        "http://{SCHEME}.localhost/capture/{capture_id}/{}",
        layer_name(kind)
    )
}

fn layer_name(kind: LayerKind) -> &'static str {
    match kind {
        LayerKind::Annotations => "layer",
        LayerKind::Highlights => "highlights",
    }
}

pub fn editor_layer_url(editor_id: EditorId, kind: LayerKind) -> String {
    format!(
        "http://{SCHEME}.localhost/editor/{editor_id}/{}",
        layer_name(kind)
    )
}

#[derive(Debug, PartialEq)]
enum Route {
    Frame {
        capture_id: u32,
        monitor_index: u32,
        format: TransferFormat,
    },
    Editor(EditorId),
    EditorLayer(EditorId, LayerKind),
    CaptureLayer(u32, LayerKind),
}

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let state = ctx.app_handle().state::<AppState>();
    // The webview's origin differs from ours, so POSTs are preflighted.
    if request.method() == Method::OPTIONS {
        responder.respond(
            Response::builder()
                .status(StatusCode::NO_CONTENT)
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST")
                .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "content-type")
                .body(Vec::new())
                .unwrap(),
        );
        return;
    }
    let route = parse(request.uri());
    let is_post = request.method() == Method::POST;
    let is_upload = matches!(
        route,
        Some(Route::EditorLayer(..) | Route::CaptureLayer(..))
    );
    if is_post != is_upload {
        responder.respond(error(StatusCode::METHOD_NOT_ALLOWED));
        return;
    }
    match route {
        Some(Route::Frame {
            capture_id,
            monitor_index,
            format,
        }) => {
            let Some(frame) = state
                .frames
                .lock()
                .unwrap()
                .frame(capture_id, monitor_index)
            else {
                responder.respond(error(StatusCode::NOT_FOUND));
                return;
            };
            // Encode off the webview's thread.
            std::thread::spawn(move || {
                let (body, content_type) = match format {
                    TransferFormat::Rgba => (bgra_to_rgba(&frame.bgra), "application/octet-stream"),
                    TransferFormat::Bmp => (encode_bmp(&frame), "image/bmp"),
                };
                responder.respond(ok(body, content_type));
            });
        }
        Some(Route::Editor(id)) => {
            let Some(image) = state.editors.lock().unwrap().image(id) else {
                responder.respond(error(StatusCode::NOT_FOUND));
                return;
            };
            std::thread::spawn(move || {
                responder.respond(ok(image.rgba.clone(), "application/octet-stream"));
            });
        }
        Some(Route::EditorLayer(id, kind)) => {
            let bytes = request.into_body();
            let n = bytes.len();
            if state.editors.lock().unwrap().set_layer(id, kind, bytes) {
                eprintln!(
                    "[editor] #{id}: {kind:?} received ({:.1} MB)",
                    n as f64 / 1e6
                );
                responder.respond(ok(Vec::new(), "text/plain"));
            } else {
                responder.respond(error(StatusCode::NOT_FOUND));
            }
        }
        Some(Route::CaptureLayer(capture_id, kind)) => {
            let bytes = request.into_body();
            let n = bytes.len();
            if crate::session::set_layer(ctx.app_handle(), capture_id, kind, bytes) {
                eprintln!(
                    "[capture] #{capture_id}: {kind:?} received ({:.1} MB)",
                    n as f64 / 1e6
                );
                responder.respond(ok(Vec::new(), "text/plain"));
            } else {
                responder.respond(error(StatusCode::NOT_FOUND));
            }
        }
        None => responder.respond(error(StatusCode::BAD_REQUEST)),
    }
}

fn ok(body: Vec<u8>, content_type: &str) -> Response<Vec<u8>> {
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-store")
        .body(body)
        .unwrap()
}

fn error(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Vec::new())
        .unwrap()
}

fn parse(uri: &tauri::http::Uri) -> Option<Route> {
    let parts: Vec<&str> = uri.path().trim_start_matches('/').split('/').collect();
    match parts.as_slice() {
        ["frame", capture_id, monitor_index] => {
            let format = match uri.query().unwrap_or("fmt=rgba") {
                "fmt=rgba" => TransferFormat::Rgba,
                "fmt=bmp" => TransferFormat::Bmp,
                _ => return None,
            };
            Some(Route::Frame {
                capture_id: capture_id.parse().ok()?,
                monitor_index: monitor_index.parse().ok()?,
                format,
            })
        }
        ["editor", id] if uri.query().is_none() => Some(Route::Editor(id.parse().ok()?)),
        ["editor", id, "layer"] if uri.query().is_none() => {
            Some(Route::EditorLayer(id.parse().ok()?, LayerKind::Annotations))
        }
        ["editor", id, "highlights"] if uri.query().is_none() => {
            Some(Route::EditorLayer(id.parse().ok()?, LayerKind::Highlights))
        }
        ["capture", id, "layer"] if uri.query().is_none() => Some(Route::CaptureLayer(
            id.parse().ok()?,
            LayerKind::Annotations,
        )),
        ["capture", id, "highlights"] if uri.query().is_none() => {
            Some(Route::CaptureLayer(id.parse().ok()?, LayerKind::Highlights))
        }
        _ => None,
    }
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
            has_alpha: false,
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
    fn parses_capture_layer_urls() {
        for kind in [LayerKind::Annotations, LayerKind::Highlights] {
            let uri: tauri::http::Uri = capture_layer_url(9, kind).parse().unwrap();
            assert_eq!(parse(&uri), Some(Route::CaptureLayer(9, kind)));
        }
    }

    #[test]
    fn parses_frame_urls() {
        let frame = |capture_id, monitor_index, format| {
            Some(Route::Frame {
                capture_id,
                monitor_index,
                format,
            })
        };
        let uri: tauri::http::Uri = frame_url(7, 2, TransferFormat::Bmp).parse().unwrap();
        assert_eq!(parse(&uri), frame(7, 2, TransferFormat::Bmp));
        let uri: tauri::http::Uri = "capture://localhost/frame/1/0".parse().unwrap();
        assert_eq!(parse(&uri), frame(1, 0, TransferFormat::Rgba));
        let uri: tauri::http::Uri = editor_url(4).parse().unwrap();
        assert_eq!(parse(&uri), Some(Route::Editor(4)));
        for kind in [LayerKind::Annotations, LayerKind::Highlights] {
            let uri: tauri::http::Uri = editor_layer_url(4, kind).parse().unwrap();
            assert_eq!(parse(&uri), Some(Route::EditorLayer(4, kind)));
        }
        for bad in [
            "http://capture.localhost/editor",
            "http://capture.localhost/editor/x",
            "http://capture.localhost/editor/1/2",
            "http://capture.localhost/editor/1/layer/x",
            "http://capture.localhost/editor/1?fmt=bmp",
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
