<p align="center">
  <img src="assets/vandal-icon-tray.png" width="128" height="128" alt="Vandal logo">
</p>

<h1 align="center">Vandal</h1>

<p align="center">
  <strong>The screenshot tool that gets out of your way.</strong><br>
  Free, open-source screen capture and markup for Windows.
</p>

<p align="center">
  <!-- TODO(Phase 4): release and build badges once hosting is decided. -->
  <strong>Beta</strong> · Windows 10 (1903+) and Windows 11 · x64
</p>

<p align="center">
  <a href="https://vandalscreenshot.com"><strong>vandalscreenshot.com</strong></a>
</p>

---

Press a shortcut, drag over any part of the screen, mark it up right there, and it's on your
clipboard. Vandal freezes the screen the instant you press the shortcut, so open menus, tooltips
and hover states stay in the picture.

<!-- TODO(Phase 4): screenshot: selecting a region on a dimmed screen (docs/images/select.png) -->
<!-- TODO(Phase 4): screenshot: quick edit toolbar under a selection (docs/images/quick-edit.png) -->

> **Vandal is in beta.** Expect rough edges, and please [report anything odd](#feedback-and-bug-reports).

## Why Vandal?

If you take screenshots all day, small annoyances add up fast. Vandal has the markup tools you
already know (arrows, boxes, highlights, text) and is built so you spend less time on each
screenshot.

- **Less click, more markup.** Keys to pick tools, number keys set the line width or font size,
  Ctrl+number picks a color, Alt+number picks a font. Mark up without hunting through menus.
- **Simplicity.** Only the most useful markup tools, designed and built well with a nice UI,
  and no extra fluff. Vandal isn't meant to be a kitchen sink.
- **Personalize to your workflow.** Choose exactly which colors, widths, fonts and font sizes appear
  in the pickers, for every tool or per tool. Load your brand or project styles once and skip
  scrolling through hundreds of fonts.
- **Use the controls you like.** A size picker can be a row of buttons, a dropdown, a stepped
  slider or a free slider with your own values. Make the UI fit your workflow and needs, not the
  other way around.
- **It remembers.** Each tool remembers its own settings (color, size, font, options, everything),
  even after a restart. Set your style once, and every screenshot after will match.
- **Free, fast, private, and lightweight.** Open source, no account, no tracking, no network connections,
  and no admin rights needed. Built in Rust with a ~2MB installer.

### Who it's for

People who take and mark up screenshots many times a day: **developers, QA testers, technical
writers, support teams and account managers**. It's especially handy for guides and manuals,
where every screenshot should look the same.

> If you suffer from the Windows Snipping Tool, like I did, this will change your life.

### Driving principles

1. **Speed.** Common actions are one keystroke. The tool stays out of the way.
2. **Simplicity.** A clean interface with the features you'll use every day. No kitchen sink.
3. **Personalization.** Your values, your controls, your workflow, remembered.

## Contents

- [Install](#install)
- [Getting started](#getting-started)
- [Capturing](#capturing)
- [Quick edit](#quick-edit)
- [The editor](#the-editor)
- [Opening images](#opening-images)
- [Copying and saving](#copying-and-saving)
- [Settings](#settings)
- [Command line](#command-line)
- [Keyboard reference](#keyboard-reference)
- [Updating and uninstalling](#updating-and-uninstalling)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)
- [All features](#all-features)
- [Feedback and bug reports](#feedback-and-bug-reports)
- [Building from source](#building-from-source)
- [License](#license)

## Install

<!-- TODO(Phase 4): download link once hosting is decided. -->

1. Download the latest `Vandal_<version>_x64-setup.exe` (download link coming soon).
2. Run it. Vandal installs for your user account only, so no administrator rights are needed.
3. **Windows SmartScreen will warn you** ("Windows protected your PC"). Beta builds
   aren't code-signed yet, so Windows doesn't recognize them. Click **More info**, then
   **Run anyway**:

   <img src="docs/images/smartscreen-more-info.png" width="380" alt="The Windows protected your PC dialog, with the More info link highlighted">
   <img src="docs/images/smartscreen-run-anyway.png" width="380" alt="The same dialog after More info, with the Run anyway button highlighted">
4. Vandal starts in the tray (bottom-right, next to the clock; it may be under the **^**
   overflow arrow). You can drag its icon onto the taskbar to keep it visible.

Vandal needs Microsoft Edge WebView2, which is part of Windows 11 and up-to-date Windows 10.
If it's missing, the installer downloads it for you.

## Getting started

1. Press **Win+F12** (you can change it in **Settings › Keyboard shortcuts**).
2. Drag over the part of the screen you want. A toolbar appears under the selection: this is
   [quick edit](#quick-edit). Pick a tool and mark up the screenshot right there, or skip it.
3. Press **Enter** (or click **Done**, or double-click inside the selection).

The image is now on your clipboard. Paste it anywhere with Ctrl+V. A notification confirms
the capture; click it (or its **Edit** button) to keep working on it in the editor, with your
marks still editable. Nothing is saved to a file unless you press **Save** (Ctrl+S) or turn on
auto-save.

You can also left-click the tray icon to start a capture, or right-click it for the menu:

| Tray menu item        | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| Capture region        | Same as Win+F12                                                            |
| Capture full screen   | Same as Win+Shift+F12: every monitor, opened in the editor                 |
| New editor window     | An empty editor: open, paste or capture an image into it                   |
| Open image…           | Open an image file in the editor                                           |
| New from clipboard    | Open the image on the clipboard in the editor                              |
| Save captures to file | Turn auto-save on or off (shown once you turn it on in Settings › General) |
| Launch on login       | Start Vandal with Windows (on by default)                                  |
| Settings…             | Open Settings                                                              |
| Quit                  | Close Vandal                                                               |

Clicking the tray icon, and opening Vandal from its desktop or Start menu icon, can open an
empty editor instead of starting a capture: **Settings › General › Tray icon and app icon**.

## Capturing

| Shortcut          | Capture                                |
| ----------------- | -------------------------------------- |
| **Win+F12**       | Select a region                        |
| **Win+Shift+F12** | All monitors, straight into the editor |

You can change both shortcuts in **Settings › Keyboard shortcuts**.

While you're selecting a region:

| Key / mouse              | Action                                                                        |
| ------------------------ | ----------------------------------------------------------------------------- |
| Drag                     | Draw a selection. Drag the handles to resize it, or drag inside it to move it |
| **Enter** / double-click | Finish                                                                        |
| **F**                    | Capture the whole monitor under the pointer (opens the editor)                |
| **A**                    | Capture all monitors (opens the editor)                                       |
| Arrow keys               | Move the selection by 1 pixel (Shift: 10 pixels)                              |
| Ctrl + arrow keys        | Resize from the bottom-right corner (Shift: 10 pixels)                        |
| **Esc** / right-click    | Cancel                                                                        |

F and A work only before you've drawn a selection. After that, A is the arrow tool.

## Quick edit

When you release the mouse, a toolbar appears under the selection (or above it if there's no
room). Pick a tool and draw straight onto the frozen screen. Every markup tool is there; only
Crop is the editor's.

<!-- TODO(Phase 4): screenshot: quick edit with an arrow and a text label (docs/images/quick-edit-markup.png) -->

- **Enter** or **Done** finishes: the result is copied (and saved, if auto-save is on).
- **Ctrl+C** copies and **Ctrl+S** saves, then quick edit closes.
- **Ctrl+E** or **Open in editor** moves your selection and marks into the full editor, still editable.
- **Ctrl+,** or the gear opens Settings on top of quick edit, so you see changes as you make them.
- **Esc** goes back one step at a time: stop typing, deselect, put the tool down, and finally
  close without saving.

Once you've drawn something, dragging outside the selection and right-clicking no longer cancel,
so a stray click can't lose your work. To turn quick edit off (Enter then just copies the region),
use **Settings › Capture**. With quick edit off, the full-screen shortcut and **F** / **A** copy
the capture instead of opening the editor.

## The editor

The editor opens for full-screen captures, from **Open in editor**, when you click a capture
notification, and for image files. **New editor window** in the tray menu opens an empty one:
open, drop, paste (Ctrl+V) or capture an image into it.

<!-- TODO(Phase 4): screenshot: the editor window with markup (docs/images/editor.png) -->

- **Tools:** Select (V), Pen (P), Highlighter (H), Line (L), Arrow (A), Rectangle (R),
  Ellipse (E), Text (T), Callout (O), Redact (B), Spotlight (S), Step marker (N) and Crop (C).
  The same tools, apart from Crop, are in quick edit. You can change their keys in
  **Settings › Keyboard shortcuts**.
  - **Callout:** a text box with a pointer. Drag from what to point at to where the text goes.
    The box can be filled, outlined or an underline, and the pointer can end in an arrow or a dot.
  - **Redact:** pixelate or blur an area. The pixels in the copied or saved image are really
    changed.
  - **Spotlight:** darken everything outside a rectangle or ellipse.
  - **Step marker:** click to place numbered (or lettered) markers that count up and renumber
    themselves.
  - **Lines and arrows** bend: drag the diamond handle on a selected one. Rectangles can have
    rounded corners.
- **Styles:** the options bar shows the current tool's colors, width, fill, font, size, and so
  on. Changing a style while a mark is selected restyles that mark. Where there are two colors
  (fill and border, text and its box), **X** swaps them.
- **Editing marks:** click a mark to select it, drag to move it, and drag its handles to reshape
  it. Double-click text (or press Enter) to edit it.
- **Crop** never throws pixels away: undo it, or choose **Show full capture** in crop mode to
  get the rest back.
- **Zoom and pan:** Ctrl+mouse wheel, Ctrl+= / Ctrl+−, Ctrl+0 to fit, Ctrl+Shift+0 for actual
  size. Pan with Space+drag or the middle mouse button.
- **Capture** (Ctrl+N) takes a new screenshot without quick edit and brings it back to the
  editor: into the same window if it's empty, otherwise a new one.
- **Closing** copies the image by default (you can change this in **Settings › Copy & save**).
  If nothing copies or saves it on close, Vandal asks before discarding changes.

## Opening images

Vandal can mark up existing images too:

- right-click an image in Explorer › **Open with** › **Vandal**. Vandal doesn't make itself the
  default app for anything.
- **Open image…** in the tray menu or the editor (Ctrl+O)
- drag files onto an editor window
- **New from clipboard** in the tray menu, or Ctrl+V in an empty editor
- `vandal --edit <file>` (see [Command line](#command-line))

It opens PNG, JPEG, BMP, GIF (first frame), TIFF, ICO and WebP, plus HEIC and AVIF if Windows
has those codecs installed. Photos are turned the right way up automatically.

**Save (Ctrl+S) overwrites the original file**, with your markup flattened into it. Vandal
warns you the first time. Use **Save As** (Ctrl+Shift+S) to keep the original. Formats Vandal
can't write (WebP, HEIC, AVIF, GIF, ICO) always go to Save As, with PNG selected.

## Copying and saving

What happens after a capture is set in **Settings › Copy & save**:

- **Copy to clipboard:** on by default.
- **Save to a file automatically:** off by default. It can also be switched from the tray menu.
- **Open in the editor:** off by default.

Captures are saved as PNG in `Pictures\Screenshots`, named like
`Screenshot 2026-09-28 14-05-09.png`. You can change the folder and the name pattern. The
pattern understands `{yyyy}` `{MM}` `{dd}` for the date and `{HH}` `{mm}` `{ss}` for the time.
If a file already has that name, a number is added: `… (2).png`.

Capture notifications have buttons to **Edit**, **Save**, or **Open folder** (after saving).

## Settings

Open Settings from the tray menu, with Ctrl+, in quick edit or the editor, or with
`vandal --settings`. Changes apply immediately, with no restart. Use the search box to find a
setting by name.

| Page               | What's there                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General            | Theme (light, dark or follow Windows), accent color, launch on login, what the tray icon and opening Vandal do, notification buttons, tray menu                   |
| Capture            | Screen dimming, selection size readout, quick edit behavior                                                                                                       |
| Copy & save        | What happens after a capture and when the editor closes, save folder, file-name pattern, overwrite warning                                                        |
| Markup             | Colors, line widths, fonts and font sizes, redact strengths, spotlight darkness, step markers, corner radii (also per tool), how the pickers look, shortcut hints |
| Keyboard shortcuts | The capture shortcuts, each tool's key and swap colors, and a list of the shortcuts that can't be changed                                                         |
| About              | Version, license and a link to the project                                                                                                                        |

Settings are stored in `%APPDATA%\com.vandal.desktop\settings.json`. They're kept when you
update Vandal.

## Command line

`vandal.exe` is in `%LOCALAPPDATA%\Vandal\`. Only one copy of Vandal runs at a time. Running it
again passes the command to the copy that's already running.

| Command                | What it does                                                     |
| ---------------------- | ---------------------------------------------------------------- |
| `vandal`               | Starts Vandal. If it's already running, starts a region capture¹ |
| `vandal --settings`    | Opens Settings                                                   |
| `vandal --edit <file>` | Opens an image in the editor. Repeat `--edit` to open several    |

A second launch that starts a capture is handy for mapping a capture to a mouse button, a
Stream Deck key or a launcher.

¹ Or opens the editor, if Settings › General › Tray icon and app icon › Opening Vandal says so.
Then a first launch opens the editor too.

## Keyboard reference

Keys are matched by position, so they work on any keyboard layout and on the number row or the
numpad.

**Tools** (editor and quick edit). These are the defaults: change them, or add Ctrl, Alt or
Shift, in **Settings › Keyboard shortcuts**, which also lists every shortcut.

| Key | Tool        | Key | Tool               |
| --- | ----------- | --- | ------------------ |
| V   | Select      | E   | Ellipse            |
| P   | Pen         | T   | Text               |
| H   | Highlighter | O   | Callout            |
| L   | Line        | B   | Redact             |
| A   | Arrow       | S   | Spotlight          |
| R   | Rectangle   | N   | Step marker        |
| X   | Swap colors | C   | Crop (editor only) |

**Styles**

| Keys              | Action                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------- |
| 1–9, 0            | Line width, text size, redact strength, darkness or marker size (0 is the 10th choice) |
| Shift+1–9, 0      | A callout's pointer thickness                                                          |
| Ctrl+1–9, 0       | Color (with two colors: the fill, text or label)                                       |
| Ctrl+Shift+1–9, 0 | The second color (the border, text box, marker or callout)                             |
| Alt+1–9, 0        | Font (text, callouts, step markers), or corner radius (rectangles, spotlight)          |
| Ctrl+B / Ctrl+I   | Bold / italic (text)                                                                   |

The number keys pick the choices in the order the pickers show them. Their shortcut numbers are
printed on the pickers (you can hide them in Settings).

**Editing**

| Keys                 | Action                                                         |
| -------------------- | -------------------------------------------------------------- |
| Ctrl+Z               | Undo                                                           |
| Ctrl+Y, Ctrl+Shift+Z | Redo                                                           |
| Ctrl+A               | Select all marks                                               |
| Ctrl+D               | Duplicate the selected marks                                   |
| Delete / Backspace   | Delete the selected marks                                      |
| Arrow keys           | Move the selected marks by 1 pixel (Shift: 10)                 |
| Ctrl+] / Ctrl+[      | Bring forward / send backward (with Shift: to front / to back) |
| Enter                | Edit the selected text, callout or step marker's label         |
| Esc                  | Step back: deselect, then put the tool down                    |
| Shift while drawing  | Square, circle, or lines at 45° steps                          |
| Shift while moving   | Move only horizontally or vertically                           |

**Editor window**

| Keys                  | Action                                                                   |
| --------------------- | ------------------------------------------------------------------------ |
| Ctrl+C                | Copy the image                                                           |
| Ctrl+S                | Save (captures use your file-name pattern; opened files are overwritten) |
| Ctrl+Shift+S          | Save As                                                                  |
| Ctrl+O                | Open an image                                                            |
| Ctrl+N                | Capture, back into the editor                                            |
| Ctrl+V                | Paste an image (into an empty editor)                                    |
| Ctrl+W                | Close                                                                    |
| Ctrl+,                | Settings                                                                 |
| Ctrl+= / Ctrl+−       | Zoom in / out                                                            |
| Ctrl+0 / Ctrl+Shift+0 | Fit to window / actual size                                              |

**Quick edit**

| Keys                 | Action                                      |
| -------------------- | ------------------------------------------- |
| Enter / double-click | Done                                        |
| Ctrl+C / Ctrl+S      | Copy / save, then close                     |
| Ctrl+E               | Open in the editor                          |
| Ctrl+,               | Settings                                    |
| Esc                  | Step back, and finally close without saving |

## Updating and uninstalling

**Updating:** run the new installer over the old version. Your settings are kept. Automatic
updates are coming in a later beta.

**Uninstalling:** go to Windows **Settings › Apps › Installed apps**, find **Vandal** and choose
**Uninstall**. This also removes Vandal from Explorer's "Open with" list. Saved screenshots are
never touched.

## Troubleshooting

**A shortcut doesn't do anything.** Another app (or Windows) may already use that key
combination. Choose a different one in **Settings › Keyboard shortcuts**. Vandal
checks whether a new shortcut is free before saving it.

**A tool's key doesn't work.** Check its key in **Settings › Keyboard shortcuts**: you may have
changed or cleared it, or given it to another tool.

**I want to use the PrintScreen key.** Windows 11 gives PrintScreen to Snipping Tool by default.
Settings › Keyboard shortcuts has a button that opens the Windows setting to turn that
off, and then you can record PrintScreen as your shortcut.

**Parts of the capture are black.** Some apps and video players block screen capture for
copyright-protected content. Windows returns black pixels for those.

**I can't find the tray icon.** Click the **^** arrow next to the clock. To keep Vandal always
visible, drag its icon onto the taskbar, or turn it on in Windows **Settings › Personalization ›
Taskbar › Other system tray icons**.

**SmartScreen blocks the installer.** Click **More info → Run anyway** (see [Install](#install)).

## Privacy

Vandal works entirely on your PC. Captures stay in memory until you copy or save them.
Vandal doesn't collect usage data and doesn't make network connections.

<!-- TODO(Phase 4): once the updater exists, note that Vandal checks for updates (and what that sends),
     and add a link to a privacy policy. -->

## All features

**Capture**

- Freezes the screen the instant you press the shortcut: open menus, tooltips and hover states
  stay in the picture
- Region, one monitor or all monitors
- Pixel-exact on multi-monitor setups with mixed scaling
- Precise selection with handles, arrow keys and a size readout
- Your own capture shortcuts (Win+F12 and Win+Shift+F12 by default), checked for conflicts,
  including PrintScreen

**Markup**

- Pen, highlighter, line, arrow, rectangle, ellipse and text
- Callouts (a text box with a pointer), redaction (pixelate or blur), spotlight and numbered
  step markers
- Curved lines and arrows, rounded corners, and two colors with a one-key swap
- Quick edit: draw right on the frozen screen, without opening a window
- Full editor with zoom, pan, undo/redo and crop that never throws pixels away
- Every mark stays editable: select, move, resize, restyle, duplicate, reorder or delete it
- Single-key tools (keys you can change), plus number-key shortcuts for sizes, colors, fonts and
  corners
- Shortcuts work on any keyboard layout, on the number row or the numpad

**Make it yours**

- Your own color presets, line widths, fonts and font sizes, for every tool or per tool
- Pick how each picker looks: buttons, dropdown, stepped slider or free slider
- Each tool remembers its styles between sessions
- Light, dark or follow-Windows theme; accent color that follows Windows or one you pick
- Choose what happens after a capture and when the editor closes (copy, save, open in the editor),
  and whether the tray icon and app icon capture or open the editor
- Auto-save folder and file-name pattern with date and time
- Searchable settings that apply immediately, with no restart

**Images and integration**

- Mark up existing images: PNG, JPEG, BMP, GIF, TIFF, ICO and WebP, plus HEIC and AVIF with
  the Windows codecs
- Explorer "Open with", drag and drop, or paste from the clipboard
- Command line for launchers, mouse buttons and Stream Deck keys
- Capture notifications with Edit, Save and Open folder buttons

**Light and private**

- Runs from the system tray and starts with Windows
- Installs for your user account only, with no admin rights
- Works entirely on your PC: no account, no usage data, no network connections
- Free and open source (GPL-3.0)
- A Rust core and an installer of about 2 MB. Vandal uses the WebView2 already in Windows
  instead of bundling a browser engine

## Feedback and bug reports

<!-- TODO(Phase 4): feedback address or issue tracker, once hosting is decided. -->

Found a bug or have an idea? Please tell us. It helps to include:

- your Vandal version (**Settings › About**) and Windows version
- how many monitors you use and their scaling (Windows **Settings › System › Display**)
- what you did, what you expected, and what happened instead, with a screenshot if you can

## Building from source

Vandal is open source. To build it yourself or to contribute, see
[DEVELOPMENT.md](DEVELOPMENT.md).

## License

Copyright © 2026 Richard Podsada.

Vandal is free software: you can redistribute it and/or modify it under the terms of the
[GNU General Public License](LICENSE) as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later version.

Vandal is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY, without even
the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
Public License for more details.
