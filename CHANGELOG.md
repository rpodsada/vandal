# Changelog

All notable changes to Vandal are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Each release's section becomes its release notes.

## [Unreleased]

### Changed

- The color picker's eyedropper button has a clearer, filled icon.

### Fixed

- The editor's tool options bar shrinks back to one row when you switch from a tool whose
  options wrapped (such as the callout in a narrow window) to one that fits on a row.

## [0.3.0-beta.10] - 2026-10-05

### Added

- **Vandal Screen Capture is in the [Chrome Web Store](https://chromewebstore.google.com/detail/vandal-screen-capture/glniniimcccgnpgfddfdepdnpbajpnfc)**,
  and Open in Vandal works with it.
- **Settings › About › Chrome Extension** says what the extension does and links to its store
  page.

## [0.3.0-beta.9] - 2026-10-05

### Added

- **Right-click an object** for Duplicate, To Front, Forward One, Back One, To Back and
  Delete. It acts on everything selected with it. The arrange items are greyed out when
  there's nothing else to move past.
- **Copy and paste objects** between editors, or within one. **Ctrl+Shift+C** copies the
  selected objects and **Ctrl+V** pastes them in front of yours, selected (Ctrl+C still copies
  the image). Pasted objects keep their place relative to the image's top-left corner, and
  slide in if they'd land outside it. The editor's right-click menu has Copy All Markup, Copy
  Object and Paste Markup, on an object or on empty canvas.

### Changed

- **The editor opens where you left it**: the same position and size as the last editor you
  closed, maximized if it was. If that spot is no longer on a screen, it opens centred on the
  screen under the pointer as before. An editor opening on top of another steps down and right.
- **Open and Save As remember their folders.** Open starts in the folder you last opened an
  image from (your Desktop the first time), and Save As in the folder you last saved to (at
  first, the opened image's folder or your save folder), instead of wherever Windows last
  remembered. Choose otherwise in Settings › Copying & Saving › Open and Save As: Open can
  start in the save folder, and Save As in the image's folder or the save folder.

## [0.3.0-beta.8] - 2026-10-03

### Added

- **Flip through a folder**, like in Windows Photos: with an image file open in the editor and
  nothing selected, **←** and **→** open the previous and next image in its folder (wrapping
  around), and **Home** and **End** the first and last. The status bar shows "12 of 41". If
  you've changed the image, Vandal asks whether to save it first.
- **Report a bug or suggest an idea** in Settings › About opens a new issue on
  [GitHub](https://github.com/rpodsada/vandal/issues), where bugs and ideas now go.

### Changed

- **Images open much faster in the editor**, especially large photos: JPEG, PNG, GIF, BMP, WebP
  and AVIF files are now read as the file itself instead of as raw pixels (about 1 MB instead
  of 48 MB for a 12-megapixel photo). HEIC and TIFF open as before.

## [0.3.0-beta.7] - 2026-10-03

### Added

- **Automatic updates.** Vandal checks for a new version when it starts and once a day, and
  tells you when one is ready. Install it from the notification, the tray menu (**Restart to
  update**) or **Settings › Updates**, whenever suits you: Vandal downloads it, checks that it
  was signed by Vandal's developer, and restarts into it, keeping your settings. Editors with
  unsaved changes ask you to save first. This is the last version you need to install by hand.
- **Settings › Updates**: check now, install, turn automatic checks off (Vandal then never
  checks unless you ask), and choose the **Beta** or **Stable** channel. Beta, the default if
  you installed a beta, gets test versions before each release.

### Changed

- **Vandal now connects to the internet for update checks**, and only for them: a small file
  from GitHub that names the latest version, with nothing about you in the request. See
  [Privacy](https://github.com/rpodsada/vandal/blob/main/README.md#privacy).
- **The installer is about 3.5 MB** (was about 2.6 MB): the part that downloads updates securely.

## [0.3.0-beta.6] - 2026-10-03

### Changed

- **Ctrl+0 always fits the image to the window** and Ctrl+Shift+0 always shows it at actual
  size, like in a browser. They no longer also pick the 10th color: Ctrl+1–9 pick colors, and
  the 10th is picked by clicking.

### Added

- **Vandal Screen Capture for Chrome**, a browser extension that captures the
  visible area, a region or a whole page, then copies it, saves it or opens it in Vandal's
  editor (starting Vandal if it isn't running). Full-page captures show sticky headers and
  cookie banners only once. Vandal's installer sets up the connection, and uninstalling removes
  it. Available soon in the Chrome Web Store.
- **Ctrl+0 again switches to Fit width** when the image is tall: the first press fits the whole
  image, the second fits its width, and a third goes back.
- **The \` key (left of 1) picks the lowest choice**: the thinnest line, smallest text, weakest
  redaction and so on, with Shift for a callout's pointer and Alt for the first font or the
  least rounded corners. On a slider, 1 is a tenth of the way along, so its minimum (say 1 px)
  had no key until now.
- **Alt+Up and Alt+Down step through the fonts**, wrapping around at the ends, for text,
  callouts and step markers, including while you type.
- **Shift while selecting an area**: drawing makes a square, a corner keeps the area's
  proportions, and moving goes only across or up and down, as in the editor.
- **Crop by drawing straight away**: while the crop box still covers the whole image, dragging
  inside it draws a new box. Ctrl+drag draws a new box anywhere, at any time.
- **Crop's ratio buttons show portrait ratios** (9:16, 3:4) while Portrait is on, and Portrait
  can be turned on before picking a ratio.

### Fixed

- **A callout's text is centred in its box in every font.** Most fonts, Arial and Helvetica
  among them, sat a little high.
- **A filled callout's pointer meets its box cleanly.** On a slant, the end of the line poked
  out beside the box.
- **Tooltips name the modifier for keys that need one**: Shift+1…0 for a callout's pointer,
  Alt+1…0 for corners. A callout's corners have no key, so their tooltip no longer mentions one.

### Security

- Installers now come with a signed build provenance record: `gh attestation verify` checks that
  an installer was built by Vandal's release workflow on GitHub and hasn't been changed since.
  The README's new **Verify your download** section shows how, and how to compare the
  installer's SHA-256 with the one on vandalscreenshot.com.
- The release workflow runs its GitHub Actions pinned to exact commits, so a tampered action
  release can't change how installers are built.
- Every release is checked first against known vulnerabilities in the libraries Vandal is built
  from, and isn't built while one is open. To report a security problem privately, see
  [SECURITY.md](https://github.com/rpodsada/vandal/blob/main/SECURITY.md).

## [0.3.0-beta.5] - 2026-10-02

### Added

- **Fit width** in the editor's zoom (the status bar and the zoom menu): the image fills the
  window's width, so a tall image scrolls instead of shrinking to a sliver. It keeps fitting
  as you resize the window and scroll.
- **Capture all screens** in the tray menu, with more than one monitor: every screen as one
  image. It can have its own shortcut (Settings › Keyboard shortcuts; none at first).

### Changed

- The tray's capture items go from smallest to largest: region, window, full screen, all screens.
- **Capture full screen** now captures one screen. The shortcut (Win+Shift+F12) takes the one the
  pointer is on; in the tray menu, with more than one monitor, you pick the screen from a list.
  Use Capture all screens (or A while selecting) for every monitor at once.
- The "A all screens" hint isn't shown while selecting when there's only one monitor.

## [0.3.0-beta.4] - 2026-10-02

### Added

- **Detect text** in Redact (the editor and quick edit): Vandal finds the words in the image and
  outlines them. Click a word to redact it, triple-click for its line, or drag across text as in a
  document; each line becomes its own redaction in the current mode. Click a redaction to remove
  it, or Ctrl+click to select it. Text it didn't find can still be covered with a box. It uses the
  text recognition built into Windows, on your PC.
- Settings › About links to Vandal's new website, [vandalscreenshot.com](https://vandalscreenshot.com),
  as well as the GitHub page.

### Security

- Redact has a new **Solid** mode that covers the area in black, and it's now the default.
  Pixelated or blurred text can sometimes be read back with special tools, so use Solid for
  passwords and the like. Settings › Markup › Redact warns when a pixelate block size is under
  6 px or a blur under 3 px.
- The notification's thumbnail of an unsaved capture is now a small copy, and Vandal deletes it
  when it quits. It used to keep a full-size copy in the temp folder indefinitely.

## [0.3.0-beta.3] - 2026-10-01

### Added

- Window capture: press W on the selection screen, then click a window to capture it. The window
  under the pointer is highlighted (across monitors too), and clicks never reach the window itself.
  Press W or Esc to go back to selecting an area. Win+Alt+F12 (changeable in Settings › Keyboard
  shortcuts) and the tray's "Capture window" start straight in window mode. The capture is the
  window's own picture: parts covered by other windows are included, it's shown as the active
  window, and it's a clean cutout: rounded corners stay transparent, without the window's border,
  shadow or (when maximized) the edge that hangs off the screen.
- Settings › General › Notifications: turn off the notification for copied captures and for
  saved ones, separately.
- `{n}` in the file name template: a number that counts up from the highest already in the save
  folder (screenshot-1, screenshot-2…). `{nn}`, `{nnn}`… pad it with zeros (01, 001).

### Changed

- The editor's Open (Ctrl+O) and Capture (Ctrl+N) load the new image into the same window instead
  of a new one. If the image there has changes that haven't been copied or saved, Vandal asks
  first. Captures from the shortcuts or the tray still open a new window.
- An empty editor no longer shows "1 × 1 px" and zoom controls, and its hint line lists only
  what works there: capture, open, paste, drop a file, settings.
- With the tray icon (or launching Vandal) set to open the editor, it brings back the editor you
  last used instead of opening another empty one each time. The tray menu's "New editor window"
  still opens a new one.
- The tray menu groups its items: the three captures, then "New editor window" and "New from
  clipboard", then "Open image…".
- Copied images keep their transparency for apps that support it, and apps that don't (such as
  Paint) now show transparent areas as white rather than black.

### Removed

- The tray menu's "Save captures to file" switch (and its setting under General). Turn automatic
  saving on or off in Settings › Copy & save.

## [0.3.0-beta.2] - 2026-09-30

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
- New editor window, in the tray menu: an editor with no image yet. Open an image, drop a file on
  it, paste one with Ctrl+V or take a new capture, and it loads into that window.
- Settings › General › Tray icon and app icon: choose what clicking the tray icon and opening
  Vandal (its desktop or Start menu icon) do: capture a region, as before, or open the editor.
  Starting with Windows never does either.
- Settings › About: the Vandal logo, version, tagline, author, copyright and license,
  and a link to the project on GitHub.
- Open Settings from quick edit with the gear on its toolbar, or with Ctrl+, (in the editor too).
  Settings opens above quick edit and stays there while you work, so changes show straight away.

### Changed

- The capture shortcuts have moved to a new Settings page, Keyboard shortcuts.
- The editor's New capture button is now Capture: it skips quick edit and opens the capture in the editor (in the same window
  if it has no image yet).
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

[Unreleased]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.10...HEAD
[0.3.0-beta.10]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.9...v0.3.0-beta.10
[0.3.0-beta.9]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.8...v0.3.0-beta.9
[0.3.0-beta.8]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.7...v0.3.0-beta.8
[0.3.0-beta.7]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.6...v0.3.0-beta.7
[0.3.0-beta.6]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.5...v0.3.0-beta.6
[0.3.0-beta.5]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.4...v0.3.0-beta.5
[0.3.0-beta.4]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.3...v0.3.0-beta.4
[0.3.0-beta.3]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.2...v0.3.0-beta.3
[0.3.0-beta.2]: https://github.com/rpodsada/vandal/compare/v0.3.0-beta.1...v0.3.0-beta.2
[0.3.0-beta.1]: https://github.com/rpodsada/vandal/compare/v0.2.0...v0.3.0-beta.1
[0.2.0]: https://github.com/rpodsada/vandal/releases/tag/v0.2.0
