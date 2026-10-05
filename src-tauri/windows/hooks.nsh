; Installer hooks (Tauri `bundle.windows.nsis.installerHooks`).
;
; "Open with" for image files (PLAN 2D): Vandal is offered for these types
; (Explorer's Open with menu and list) but never made their default app.
; Tauri's own `fileAssociations` sets the extension's default class, which can
; take over types the user never explicitly assigned, so we register only
; OpenWithProgids and the Applications entry. Uninstall removes it all.

!define CAPTURE_PROGID "Vandal.Image"

!macro CAPTURE_OPEN_WITH EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${CAPTURE_PROGID}" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".${EXT}" ""
!macroend

!macro CAPTURE_NO_OPEN_WITH EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${CAPTURE_PROGID}"
!macroend

; Keep in step with `decode::EXTENSIONS`.
!macro CAPTURE_EACH_EXT MACRO
  !insertmacro ${MACRO} png
  !insertmacro ${MACRO} jpg
  !insertmacro ${MACRO} jpeg
  !insertmacro ${MACRO} jpe
  !insertmacro ${MACRO} jfif
  !insertmacro ${MACRO} bmp
  !insertmacro ${MACRO} dib
  !insertmacro ${MACRO} gif
  !insertmacro ${MACRO} tif
  !insertmacro ${MACRO} tiff
  !insertmacro ${MACRO} ico
  !insertmacro ${MACRO} webp
  !insertmacro ${MACRO} heic
  !insertmacro ${MACRO} heif
  !insertmacro ${MACRO} avif
!macroend

; The browser extension's native messaging host (PLAN 3N.7c): vandal.exe
; itself, launched by the browser (`native_host.rs`). A manifest beside the exe
; (its `path` may be relative to it), named in each Chromium browser's per-user
; key. The extension IDs (the Chrome Web Store's, then unpacked builds' from
; the extension's manifest `key`) are also in `native_host.rs`; keep them in step.
!define VANDAL_HOST "com.vandal.desktop"
!define VANDAL_EXTENSIONS '"chrome-extension://glniniimcccgnpgfddfdepdnpbajpnfc/","chrome-extension://bmloooliddgohojbpadiljacckgdbngm/"'

!macro VANDAL_HOST_KEY BROWSER
  WriteRegStr HKCU "Software\${BROWSER}\NativeMessagingHosts\${VANDAL_HOST}" "" "$INSTDIR\native-host.json"
!macroend

!macro VANDAL_NO_HOST_KEY BROWSER
  DeleteRegKey HKCU "Software\${BROWSER}\NativeMessagingHosts\${VANDAL_HOST}"
!macroend

!macro VANDAL_EACH_BROWSER MACRO
  !insertmacro ${MACRO} "Google\Chrome"
  !insertmacro ${MACRO} "Microsoft\Edge"
  !insertmacro ${MACRO} "BraveSoftware\Brave-Browser"
  !insertmacro ${MACRO} "Chromium"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\${CAPTURE_PROGID}" "" "Image"
  WriteRegStr SHCTX "Software\Classes\${CAPTURE_PROGID}\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\${CAPTURE_PROGID}\shell\open" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\${CAPTURE_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" --edit "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" --edit "%1"'
  !insertmacro CAPTURE_EACH_EXT CAPTURE_OPEN_WITH
  FileOpen $0 "$INSTDIR\native-host.json" w
  FileWrite $0 '{"name":"${VANDAL_HOST}","description":"${PRODUCTNAME}","path":"${MAINBINARYNAME}.exe","type":"stdio","allowed_origins":[${VANDAL_EXTENSIONS}]}'
  FileClose $0
  !insertmacro VANDAL_EACH_BROWSER VANDAL_HOST_KEY
  ; SHCNE_ASSOCCHANGED: let Explorer pick up the change now.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro CAPTURE_EACH_EXT CAPTURE_NO_OPEN_WITH
  DeleteRegKey SHCTX "Software\Classes\${CAPTURE_PROGID}"
  DeleteRegKey SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  !insertmacro VANDAL_EACH_BROWSER VANDAL_NO_HOST_KEY
  Delete "$INSTDIR\native-host.json"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
