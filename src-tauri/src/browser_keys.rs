//! Our windows are app UI, not browser tabs: WebView2's own browser keys
//! (F7 caret browsing, F5 reload, Ctrl+F find, Ctrl+P print, devtools...)
//! are switched off in WebView2 itself. Page code can't stop them: WebView2
//! acts on some before the page sees the key, and F7's "Turn on caret
//! browsing?" prompt blocks every window of ours (they share one page
//! process) until it's answered. `src/shared/browserUi.ts` still cancels the
//! rest (context menu, Alt+arrows).

use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
use windows::core::Interface;

/// Switch off WebView2's browser keys in `window` (applies from now on).
pub fn disable(window: &WebviewWindow) {
    let label = window.label().to_string();
    let result = window.with_webview(move |webview| {
        // SAFETY: COM calls on the controller Tauri hands us, on the thread
        // that owns it.
        let done = unsafe {
            webview
                .controller()
                .CoreWebView2()
                .and_then(|core| core.Settings())
                .and_then(|settings| settings.cast::<ICoreWebView2Settings3>())
                .and_then(|settings| settings.SetAreBrowserAcceleratorKeysEnabled(false))
        };
        if let Err(e) = done {
            eprintln!("[webview] {label}: can't turn off browser keys: {e}");
        }
    });
    if let Err(e) = result {
        eprintln!("[webview] {}: {e}", window.label());
    }
}
