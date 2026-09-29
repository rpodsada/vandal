# Changelog

All notable changes to Vandal are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Each release's section becomes its release notes.

## [Unreleased]

### Added

- Redact tool (B) in quick edit and the editor: drag over an area to pixelate or blur it. The choice of Pixelate or
  Blur and the strength are in the options bar. Redactions always sit under the other markup, and
  the saved or copied image's pixels are really changed, so they can't be removed afterwards.
- Settings › Markup › Redact: choose the block sizes and blur strengths the redact tool offers.

### Changed

- A notification's Edit (or a click on it) reopens the capture just as "Open in editor" would:
  quick edit's annotations are still editable, and the crop can grow back out to the whole screen.
  Closing the editor without changes no longer copies the image again.
- The editor's "Copied" and "Saved" messages in the status bar now start with a green check.

### Fixed

- In quick edit, right-clicking a color swatch to edit it no longer cancels the capture.

## [0.3.0-beta.1] - 2026-09-28

The first build for beta testers.

### Added

- Light and dark themes, or follow Windows (Settings › General › Appearance).
- Accent color: follows the Windows accent by default, or pick a preset or your own color.
- Change the capture shortcuts in Settings › Capture › Keyboard shortcuts: press the new
  combination, clear it or reset it. Vandal checks that a shortcut isn't already taken by
  Windows or another app before saving it.
- A button that opens the Windows setting for handing the PrintScreen key to another app.

### Changed

- Vandal is now open source, under the GNU General Public License v3.0 or later.
- The app is now called **Vandal**, with its own icon in the taskbar, the tray and the
  installer. The command line is now `vandal --settings` / `vandal --edit <file>`.
- Settings are now stored under `%APPDATA%\com.vandal.desktop\`. Settings from earlier
  builds (`com.captureapp.desktop`) are not carried over.

### Fixed

- Pressing F7 (and other browser shortcut keys) could freeze every Vandal window.

## [0.2.0] - 2026-09-27

### Added

- Quick edit: mark up a region selection right on the screen, then copy, save or open it in
  the editor.
- Full editor: zoom, pan, non-destructive crop, undo/redo, copy, save, Save As and new capture.
- Markup tools: pen, highlighter, line, arrow, rectangle, ellipse and text. Every mark stays
  editable (select, move, reshape, restyle, duplicate, reorder, delete).
- Style shortcuts: number keys for widths and font sizes, Ctrl+number for colors,
  Alt+number for fonts.
- Open image files (PNG, JPEG, WebP, GIF, TIFF, BMP, ICO; HEIC/AVIF with Windows codecs) from
  "Open with", Ctrl+O, drag and drop, the clipboard or `--edit <file>`.
- Settings › Markup: color presets, line widths, fonts and font sizes, globally or per tool.

## [0.1.0] - 2026-09-26

### Added

- Tray app with region (Win+F12) and full-screen (Win+Shift+F12) capture that freezes the
  screen before anything appears.
- Pixel-exact capture across monitors with different scaling.
- Copy to clipboard, auto-save with a file-name pattern, and capture notifications.
- Searchable Settings window where changes apply immediately.

[Unreleased]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.1...HEAD
[0.3.0-beta.1]: https://github.com/rpodsada/vandal/compare/v0.2.0...v0.3.0-beta.1
[0.2.0]: https://github.com/rpodsada/vandal/releases/tag/v0.2.0
