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
- Curved lines and arrows: drag the diamond handle on a selected line or arrow to bend it. Slide
  the handle toward an end to make the curve lean that way, or hold Shift for a perfect circular
  arc. It snaps straight near the straight line, and double-clicking the handle straightens it.
- Spotlight tool (S): darken everything outside a rectangle or ellipse to draw attention to it.
  Several spotlights share one darkness, set in the options bar; arrows and text stay bright.
- Settings › Markup › Spotlight: choose the darkness levels the spotlight tool offers.
- Step tool (N): click to place numbered markers (1, 2, 3… or A, B, C…) that count up in the order
  you placed them, and renumber when one is deleted. Choose the start value, the shape (circle,
  square or rounded square), size, marker color and label color; each new marker takes the last
  style used. Sync style gives every marker the current style, and asks first if you had
  styled them differently.
- Step markers can have their own label: double-click one (or select it and press Enter) and type
  up to three characters. The other markers keep counting around it, and Renumber puts every
  marker back to counting.
- Step markers have a font picker in the options bar; with a custom list, Alt+1–9 and Alt+0 pick
  from it.
- Settings › Markup › Step markers: choose the marker sizes, and the fonts: all installed fonts,
  the same ones as the text tool (the default), or a custom list. Step markers can also have
  their own colors under Per-tool styles.
- Settings: the open page's groups are listed under it in the sidebar. Click one to scroll to it; the
  one you're looking at is highlighted.
- Settings › Markup › Per-tool styles: each tool's custom colors and custom widths switches now
  sit one above the other, each with its editor right under it, with more room between them.
- Settings: a clearer look. Larger group headings and setting names, rows separated by gaps, even
  10 px spacing between a setting's controls, value boxes with the number centred and a remove
  button that turns red on hover (click anywhere in a box to edit the number), add buttons that
  light up in the accent color, and "Custom list" instead of "My list" for fonts.
- Sliders in the options bar no longer touch the control beside them at their first stop.
- Swap the two colors (a shape's fill and border, text and its box, a step marker's label and
  marker) with the swap button on the color chip, or press X.
- Colors can show as dropdowns instead of swatches, to save room in the options bar: a button per
  color that opens the palette (with the custom color and the swap button between two colors).
  Right-click a color's button to edit the color in use straight away. Choose it in Settings ›
  Markup › Colors, or for one tool under Per-tool styles. The keys work the same either way.
- Rounded corners for rectangles and the spotlight's rectangle: pick a corner radius in the options
  bar, or with Alt+1–9 and Alt+0.
- Settings › Markup › Rounded corners: choose the corner radii on offer, as a dropdown, a slider
  or a stepped slider. Square corners (0) are always one of them.
- Callout tool (O): drag from what you want to point at to where the text goes (or just click),
  then type. The text sits in a colored box with a pointer to that spot. Drag the handle at the
  pointer's end to point somewhere else; moving or resizing the callout leaves the pointer's end
  where it is, and the pointer always leaves the box on the side facing it. As you type, the
  text grows away from the pointer (both ways when it points up or down). Pick the text size
  with 1–9 and 0, the pointer's thickness with Shift+1–9 and Shift+0, and the font with Alt.
  The pointer can end plainly, in an arrow or in a dot. Instead of a box, a callout can have a
  line under its text (over it when the pointer points up), with the pointer at its nearer end.
  The box can also be just an outline, as thick as the pointer and the same color.
  Selected with other objects, a callout's frame takes in its pointer, and rotating the group
  carries it around with the rest, its text staying upright.
- Change the markup tools' keys, and the swap colors key, in Settings › Keyboard shortcuts: a
  letter, alone or with Ctrl, Alt or Shift. Picking a key another tool has asks first, then
  leaves that tool without one. Tooltips and the hint line show the keys you chose. The page
  also lists the shortcuts that can't be changed, for marking up, quick edit and the editor.
- Open Settings from quick edit with the gear on its toolbar, or with Ctrl+, (in the editor too).
  Settings opens above quick edit and stays there while you work, so changes show straight away.

### Changed

- The capture shortcuts have moved to a new Settings page, Keyboard shortcuts.
- Holding Shift while moving objects keeps the move horizontal or vertical.
- In quick edit, a callout's options take two rows, with its text and colors on the second, so
  the toolbar is less wide.
- In the options bar, a size, width or strength shown as a dropdown or slider has an icon before
  it saying what it sets, and sliders are narrower.
- The two-color chip in the options bar is clearer: two overlapping circles with thin borders, the
  active one in front with a dark edge. For text and step markers the top circle is the text color
  with an "A" on it; for shapes with a border and fill, the fill is now the top color and the
  border the ring below.
  Ctrl+1–9/0 set the top color and Ctrl+Shift+1–9/0 the bottom one, so for those shapes they now
  set the fill and the border respectively.
- A notification's Edit (or a click on it) reopens the capture just as "Open in editor" would:
  quick edit's annotations are still editable, and the crop can grow back out to the whole screen.
  Closing the editor without changes no longer copies the image again.
- The editor's "Copied" and "Saved" messages in the status bar now start with a green check.
- Number buttons in the options bar (spotlight darkness, redact strength, marker and font sizes)
  can show their unit after the number, as the sliders and dropdowns do: turn on "Show units on
  number buttons" in Settings › Markup (off by default).

### Fixed

- With two colors (a shape's fill and border, text on a box, a step marker), picking a custom
  color for one no longer changes the other. Each keeps its own custom color, and the custom
  swatch shows the one for the color you're setting.
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
