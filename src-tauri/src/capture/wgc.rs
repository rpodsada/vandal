//! Window capture with Windows.Graphics.Capture (PLAN 3H.2): the window's own
//! pixels, even where it's covered, with transparent rounded corners and no
//! shadow. Measured in the 3H spike: ~10 ms to the first frame once the D3D
//! device exists (~200 ms to create, so it's made once, ahead of time).

use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use windows::core::{Interface, Ref};
use windows::Foundation::TypedEventHandler;
use windows::Graphics::Capture::{
    Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem,
};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Foundation::{HMODULE, HWND};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;

use super::{CaptureError, WindowCapturer, WindowImage};

/// The picture counts as settled once no new frame has come for this long
/// (WGC only delivers a frame when the window's content changes).
const QUIET: Duration = Duration::from_millis(60);
/// Take the latest frame by then, even if the window keeps changing (video).
const SETTLE_CAP: Duration = Duration::from_millis(300);
/// The first frame normally arrives in ~10 ms.
const FIRST_FRAME: Duration = Duration::from_millis(500);

#[derive(Default)]
pub struct WgcCapturer {
    device: Mutex<Option<Device>>,
}

struct Device {
    d3d: ID3D11Device,
    context: ID3D11DeviceContext,
    winrt: IDirect3DDevice,
}

// D3D11 devices are free-threaded, and the immediate context is only used
// behind the mutex.
unsafe impl Send for Device {}

impl Device {
    fn new() -> windows::core::Result<Self> {
        let mut d3d = None;
        unsafe {
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut d3d),
                None,
                None,
            )?;
        }
        let d3d =
            d3d.ok_or_else(|| windows::core::Error::from_hresult(windows::core::HRESULT(-1)))?;
        let dxgi: IDXGIDevice = d3d.cast()?;
        let winrt: IDirect3DDevice =
            unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? }.cast()?;
        let context = unsafe { d3d.GetImmediateContext()? };
        Ok(Self {
            d3d,
            context,
            winrt,
        })
    }

    /// Start capturing `hwnd`, wait for its picture to settle, and read the
    /// last frame back.
    fn capture(&self, hwnd: HWND) -> windows::core::Result<WindowImage> {
        let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
        let item: GraphicsCaptureItem = unsafe { interop.CreateForWindow(hwnd)? };
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &self.winrt,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            item.Size()?,
        )?;
        let session = pool.CreateCaptureSession(&item)?;
        // Windows 11: no yellow border. Older builds can't turn it off; it's
        // drawn on screen (under our overlay), not into the frames.
        let _ = session.SetIsBorderRequired(false);
        let _ = session.SetIsCursorCaptureEnabled(false);
        let (tx, rx) = mpsc::channel::<Direct3D11CaptureFrame>();
        pool.FrameArrived(&TypedEventHandler::new(
            move |pool: Ref<Direct3D11CaptureFramePool>, _| {
                if let Some(pool) = pool.as_ref() {
                    if let Ok(frame) = pool.TryGetNextFrame() {
                        let _ = tx.send(frame);
                    }
                }
                Ok(())
            },
        ))?;

        let started = Instant::now();
        session.StartCapture()?;
        let first = rx.recv_timeout(FIRST_FRAME);
        let result = match first {
            Ok(mut last) => {
                let mut frames = 1;
                loop {
                    let left = SETTLE_CAP.saturating_sub(started.elapsed());
                    if left.is_zero() {
                        break;
                    }
                    match rx.recv_timeout(QUIET.min(left)) {
                        Ok(frame) => {
                            last = frame;
                            frames += 1;
                        }
                        Err(_) => break,
                    }
                }
                self.read(&last).map(|mut image| {
                    image.frames = frames;
                    image.settle = started.elapsed();
                    image
                })
            }
            Err(_) => Err(windows::core::Error::new(
                windows::core::HRESULT(-1),
                "the window sent no frame",
            )),
        };
        let _ = session.Close();
        let _ = pool.Close();
        result
    }

    /// Copy a frame to the CPU as straight-alpha BGRA.
    fn read(&self, frame: &Direct3D11CaptureFrame) -> windows::core::Result<WindowImage> {
        let texture: ID3D11Texture2D = unsafe {
            frame
                .Surface()?
                .cast::<IDirect3DDxgiInterfaceAccess>()?
                .GetInterface()?
        };
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { texture.GetDesc(&mut desc) };
        // The pool's buffers are sized when it starts; the window's content
        // may be smaller (it resized since), and sits at the top left.
        let content = frame.ContentSize()?;
        let width = (content.Width.max(1) as u32).min(desc.Width);
        let height = (content.Height.max(1) as u32).min(desc.Height);
        desc.Usage = D3D11_USAGE_STAGING;
        desc.BindFlags = 0;
        desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
        desc.MiscFlags = 0;
        let mut staging = None;
        unsafe { self.d3d.CreateTexture2D(&desc, None, Some(&mut staging))? };
        let staging = staging
            .ok_or_else(|| windows::core::Error::from_hresult(windows::core::HRESULT(-1)))?;

        let row = width as usize * 4;
        let mut bgra = vec![0u8; row * height as usize];
        unsafe {
            self.context.CopyResource(&staging, &texture);
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            self.context
                .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
            for y in 0..height as usize {
                let src = std::slice::from_raw_parts(
                    (mapped.pData as *const u8).add(y * mapped.RowPitch as usize),
                    row,
                );
                bgra[y * row..][..row].copy_from_slice(src);
            }
            self.context.Unmap(&staging, 0);
        }
        unpremultiply(&mut bgra);
        Ok(WindowImage {
            width,
            height,
            bgra,
            frames: 0,
            settle: Duration::ZERO,
        })
    }
}

impl WindowCapturer for WgcCapturer {
    fn name(&self) -> &'static str {
        "wgc"
    }

    fn prepare(&self) {
        let mut device = self.device.lock().unwrap();
        if device.is_none() {
            match Device::new() {
                Ok(d) => *device = Some(d),
                Err(e) => eprintln!("[capture] D3D device for window capture failed: {e}"),
            }
        }
    }

    fn capture_window(&self, hwnd: isize) -> Result<WindowImage, CaptureError> {
        let hwnd = HWND(hwnd as *mut _);
        let mut device = self.device.lock().unwrap();
        // One retry on a fresh device: the old one may have been lost (driver
        // update, GPU reset).
        for attempt in 0..2 {
            if device.is_none() {
                *device = Some(Device::new()?);
            }
            match device.as_ref().unwrap().capture(hwnd) {
                Ok(image) => return Ok(image),
                Err(e) if attempt == 0 => {
                    eprintln!("[capture] window capture failed ({e}); retrying on a new device");
                    *device = None;
                }
                Err(e) => return Err(e.into()),
            }
        }
        unreachable!()
    }
}

/// WGC's frames are premultiplied; the rest of the app is straight alpha.
pub fn unpremultiply(bgra: &mut [u8]) {
    for p in bgra.chunks_exact_mut(4) {
        let a = u16::from(p[3]);
        if a == 0 {
            p[..3].fill(0);
        } else if a < 255 {
            for c in &mut p[..3] {
                *c = ((u16::from(*c) * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::unpremultiply;

    #[test]
    fn unpremultiplies() {
        let mut px = vec![
            10, 20, 30, 255, // opaque: unchanged
            34, 34, 34, 97, // a rounded corner's edge
            5, 5, 5, 0, // fully transparent: black
            200, 0, 0, 100, // over-bright input is clamped
        ];
        unpremultiply(&mut px);
        assert_eq!(
            px,
            vec![10, 20, 30, 255, 89, 89, 89, 97, 0, 0, 0, 0, 255, 0, 0, 100]
        );
    }
}
