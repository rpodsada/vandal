// Every setting in the settings window, declared as data. See schema.ts.
//
// Pages follow the capture flow (PLAN §4.7): General (the app itself),
// Capture (taking the shot), Copy & save (where the image goes), Markup (tools
// and styles, shared by quick edit and the editor), Keyboard shortcuts, About.
import { SHORTCUT_NAMES, type ShortcutId } from "../markup/shortcuts";
import { commands } from "../shared/ipc";
import { EDITOR_KEYS, MARKUP_KEYS, QUICK_EDIT_KEYS } from "./fixedShortcuts";
import { AboutIcon, CaptureIcon, GeneralIcon, KeyboardIcon, MarkupIcon, SaveIcon } from "./icons";
import type { Section } from "./schema";

/** What clicking the tray icon or opening Vandal does (PLAN 3G). */
const ICON_ACTIONS = [
  { value: "capture", label: "Capture a region" },
  { value: "editor", label: "Open the editor" },
] as const;

export const sections: Section[] = [
  {
    id: "general",
    title: "General",
    icon: GeneralIcon,
    description: "How the app looks and starts, its notifications and its tray icon.",
    groups: [
      {
        title: "Appearance",
        items: [
          {
            id: "theme",
            kind: "choice",
            path: "appearance.theme",
            label: "Theme",
            options: [
              { value: "system", label: "Follow Windows" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ],
            keywords: ["dark mode", "light mode", "color", "theme", "appearance", "night"],
          },
          {
            id: "accent",
            kind: "accent",
            path: "appearance.accent",
            label: "Accent color",
            description:
              "Used for selected buttons, switches and the Save button. Follows your Windows accent color unless you pick one.",
            keywords: ["accent", "color", "colour", "highlight", "theme", "windows"],
          },
        ],
      },
      {
        title: "Startup",
        items: [
          {
            id: "launch-on-login",
            kind: "toggle",
            path: "startup.launchOnLogin",
            label: "Launch on login",
            description: "Start in the tray when you sign in to Windows.",
            keywords: ["startup", "autostart", "boot"],
          },
        ],
      },
      {
        title: "Tray icon and app icon",
        items: [
          {
            id: "tray-click-action",
            kind: "choice",
            path: "tray.clickAction",
            label: "Clicking the tray icon",
            options: ICON_ACTIONS,
            keywords: ["tray", "click", "editor", "capture"],
          },
          {
            id: "launch-action",
            kind: "choice",
            path: "startup.launchAction",
            label: "Opening Vandal",
            description:
              "From its desktop or Start menu icon. If Vandal isn't running yet, it starts in the tray and only opens the editor, never a capture.",
            options: ICON_ACTIONS,
            keywords: [
              "launch",
              "desktop",
              "start menu",
              "icon",
              "shortcut",
              "double-click",
              "editor",
            ],
          },
        ],
      },
      {
        title: "Notifications",
        items: [
          {
            id: "notify-copied",
            kind: "toggle",
            path: "afterCapture.notifyCopied",
            label: "Notify when a capture is copied",
            keywords: ["toast", "popup", "clipboard", "quiet", "silent"],
          },
          {
            id: "notify-saved",
            kind: "toggle",
            path: "afterCapture.notifySaved",
            label: "Notify when a capture is saved",
            description:
              "A capture that's neither copied nor saved always notifies, so you can still save or edit it. Windows holds notifications back while Do Not Disturb is on.",
            keywords: ["toast", "popup", "file", "quiet", "silent", "do not disturb", "focus"],
          },
          {
            id: "notification-save-button",
            kind: "toggle",
            path: "save.notificationSaveButton",
            label: "Save button on notifications",
            description:
              "When a capture isn't saved automatically, save it from the notification with one click.",
            keywords: ["toast", "popup"],
          },
          {
            id: "notification-edit-button",
            kind: "toggle",
            path: "editor.notificationEditButton",
            label: "Edit button on notifications",
            description:
              "Open a capture in the editor from its notification. Clicking the notification itself does this too.",
            keywords: ["toast", "popup", "editor", "markup"],
          },
        ],
      },
    ],
  },
  {
    id: "capture",
    title: "Capture",
    icon: CaptureIcon,
    description: "Taking a screenshot: the selection screen and quick edit.",
    groups: [
      {
        title: "Selection screen",
        items: [
          {
            id: "dim-opacity",
            kind: "slider",
            path: "overlay.dimOpacity",
            label: "Dim the screen while selecting",
            description: "How dark the area outside your selection looks.",
            min: 0,
            max: 0.9,
            step: 0.05,
            format: (v) => `${Math.round(v * 100)}%`,
            keywords: ["overlay", "darken", "opacity"],
          },
          {
            id: "show-dimensions",
            kind: "toggle",
            path: "overlay.showDimensions",
            label: "Show selection size",
            description: "Display the width × height in pixels next to the selection.",
            keywords: ["overlay", "pixels", "width", "height"],
          },
        ],
      },
      {
        title: "Quick edit",
        items: [
          {
            id: "quick-edit",
            kind: "toggle",
            path: "quickEdit.enabled",
            label: "Show a toolbar on the selection",
            description:
              "Copy, save or mark up the area right away. When it's off, Enter captures the selection.",
            keywords: ["quick edit", "toolbar", "markup", "annotate"],
          },
          {
            id: "quick-edit-close-copy",
            kind: "toggle",
            path: "quickEdit.closeOnCopy",
            label: "Close after copying",
            description: "Copy (Ctrl+C) also finishes the capture.",
            keywords: ["quick edit", "clipboard"],
            disabled: (s) => !s.quickEdit.enabled,
          },
          {
            id: "quick-edit-close-save",
            kind: "toggle",
            path: "quickEdit.closeOnSave",
            label: "Close after saving",
            description: "Save (Ctrl+S) also finishes the capture.",
            keywords: ["quick edit", "file"],
            disabled: (s) => !s.quickEdit.enabled,
          },
        ],
      },
    ],
  },
  {
    id: "copy-save",
    title: "Copy & save",
    icon: SaveIcon,
    description:
      "What happens to your image after a capture or when you close the editor, and where files go.",
    groups: [
      {
        title: "After a capture",
        items: [
          {
            id: "copy-to-clipboard",
            kind: "toggle",
            path: "afterCapture.copyToClipboard",
            label: "Copy to clipboard",
            keywords: ["paste"],
          },
          {
            id: "auto-save",
            kind: "toggle",
            path: "afterCapture.autoSave",
            label: "Save to a file automatically",
            description: "Every capture is saved to the folder below.",
            keywords: ["auto-save", "autosave", "disk"],
          },
          {
            id: "open-editor",
            kind: "toggle",
            path: "afterCapture.openEditor",
            label: "Open in the editor",
            description:
              "Captures open in the full editor. Copying and saving then happen from the editor instead of right away.",
            keywords: ["edit", "markup", "annotate"],
          },
        ],
      },
      {
        title: "When you close the editor",
        description: "Skipped if you already copied or saved since your last change.",
        items: [
          {
            id: "editor-close-copy",
            kind: "toggle",
            path: "editor.onClose.copy",
            label: "Copy to clipboard",
            keywords: ["close", "exit", "paste", "editor"],
          },
          {
            id: "editor-close-save",
            kind: "toggle",
            path: "editor.onClose.save",
            label: "Save to a file",
            description:
              "Uses the folder and file name below. With neither option on, you're asked before unsaved changes are lost.",
            keywords: ["close", "exit", "auto-save", "autosave", "editor"],
          },
        ],
      },
      {
        title: "Where to save",
        items: [
          {
            id: "save-directory",
            kind: "folder",
            path: "save.directory",
            label: "Folder",
            keywords: ["directory", "path", "location"],
          },
          {
            id: "filename-template",
            kind: "text",
            path: "save.filenameTemplate",
            label: "File name",
            preview: (template) => commands.previewFilename(template),
            help: "Use {yyyy} {MM} {dd} for the date, {HH} {mm} {ss} for the time, and {n} for a number that counts up ({nnn} gives 001, 002…).",
            keywords: ["name", "template", "pattern", "number", "counter", "sequence"],
          },
        ],
      },
      {
        title: "Opened images",
        items: [
          {
            id: "editor-confirm-overwrite",
            kind: "toggle",
            path: "editor.confirmOverwrite",
            label: "Warn before saving over an opened image",
            description:
              "Save writes the markup into the original file. Off: Save replaces it without asking.",
            keywords: ["overwrite", "replace", "original", "file", "open", "warning", "confirm"],
          },
        ],
      },
    ],
  },
  {
    id: "markup",
    title: "Markup",
    icon: MarkupIcon,
    description: "Tools and styles for quick edit and the editor.",
    groups: [
      {
        title: "Behavior",
        items: [
          {
            id: "editor-drawing-tools-select",
            kind: "toggle",
            path: "editor.drawingToolsSelect",
            label: "Drawing tools select objects under the pointer",
            description:
              "Off: drawing tools always draw, even over other objects, and you select with the Select tool. Hold Ctrl to do the opposite for one click.",
            keywords: ["draw over", "click", "select", "move", "ctrl", "arrow", "overlap"],
          },
          {
            id: "editor-share-color",
            kind: "toggle",
            path: "editor.shareColor",
            label: "All tools use the same color",
            description:
              "Picking a color for one tool picks it for the others too (except tools with their own palette, like the highlighter). Off: each tool keeps its own color.",
            keywords: ["color", "colour", "shared", "same", "sync", "palette"],
          },
          {
            id: "editor-remember-tool-styles",
            kind: "toggle",
            path: "editor.rememberToolStyles",
            label: "Remember tool styles between windows",
            description:
              "New editors start with the colors, widths, fonts and other options you last used, even after a restart. Off: every editor starts from the defaults.",
            keywords: [
              "remember",
              "keep",
              "persist",
              "restore",
              "defaults",
              "color",
              "width",
              "font",
            ],
          },
          {
            id: "editor-shortcut-hints",
            kind: "toggle",
            path: "editor.showShortcutHints",
            label: "Show shortcut hints on the pickers",
            description:
              "Slot numbers on the widths, sizes, colors and fonts while you hold a number key, Ctrl or Alt, and the keys in their tooltips. The shortcuts work either way.",
            keywords: ["shortcut", "hint", "badge", "number", "keyboard", "tooltip", "digit"],
          },
          {
            id: "editor-button-units",
            kind: "toggle",
            path: "editor.showButtonUnits",
            label: "Show units on number buttons",
            description:
              'Buttons for sizes, strengths and darkness show their unit after the number, like "50%" or "10px". Off keeps them shorter.',
            keywords: ["unit", "units", "px", "percent", "pt", "button", "number", "label"],
          },
        ],
      },
      {
        title: "Colors",
        items: [
          {
            id: "styles-palette",
            kind: "palette",
            path: "styles.palette",
            label: "Color presets",
            description:
              "The colors the tools offer, in order. Ctrl+1–9 and Ctrl+0 pick them while you draw. Click a color to change or remove it; drag it to reorder.",
            keywords: ["color", "colour", "palette", "preset", "swatch", "reorder"],
          },
          {
            id: "styles-color-control",
            kind: "choice",
            path: "styles.colorControl",
            label: "Show colors as",
            description:
              "Swatches show every color in the options bar. A dropdown takes less room: a button per color that opens the palette. The keys work the same either way. A tool can have its own choice under Per-tool styles.",
            options: [
              { value: "swatches", label: "Swatches" },
              { value: "dropdown", label: "Dropdown" },
            ],
            keywords: [
              "color",
              "colour",
              "swatch",
              "dropdown",
              "menu",
              "compact",
              "space",
              "toolbar",
            ],
          },
        ],
      },
      {
        title: "Line width",
        items: [
          {
            id: "styles-width",
            kind: "numberPicker",
            path: "styles.width",
            label: "Width choices",
            description:
              "The widths the drawing tools offer, in pixels. Keys 1–9 and 0 pick them while you draw.",
            unit: "px",
            lines: true,
            keywords: [
              "line",
              "width",
              "thickness",
              "stroke",
              "size",
              "picker",
              "slider",
              "buttons",
            ],
          },
        ],
      },
      {
        title: "Text",
        items: [
          {
            id: "styles-fonts",
            kind: "fontPicker",
            path: "styles.font",
            label: "Fonts",
            description:
              "The fonts the text tool offers. With a custom list, Alt+1–9 and Alt+0 pick them while you type.",
            keywords: ["font", "typeface", "family", "text", "list", "installed"],
          },
          {
            id: "styles-font-size",
            kind: "numberPicker",
            path: "styles.fontSize",
            label: "Font sizes",
            description: "The sizes the text tool offers, in points. Keys 1–9 and 0 pick them.",
            unit: "pt",
            keywords: ["font", "size", "text", "points", "pt", "picker"],
          },
        ],
      },
      {
        title: "Redact",
        items: [
          {
            id: "styles-pixelate",
            kind: "numberPicker",
            path: "styles.pixelate",
            label: "Pixelate block sizes",
            description:
              "The block sizes the redact tool offers for Pixelate, in pixels. Bigger blocks hide more. Keys 1–9 and 0 pick them.",
            unit: "px",
            keywords: ["redact", "pixelate", "mosaic", "block", "strength", "hide", "censor"],
            // PLAN 3I.2: allowed for a light effect, but weak on text.
            warnBelow: {
              value: 6,
              message:
                "Blocks under 6 px may not hide text: some tools can read pixelated text back. Use Solid for passwords and other secrets.",
            },
          },
          {
            id: "styles-blur",
            kind: "numberPicker",
            path: "styles.blur",
            label: "Blur strengths",
            description:
              "The blur radii the redact tool offers for Blur, in pixels. A bigger radius hides more. Keys 1–9 and 0 pick them.",
            unit: "px",
            keywords: ["redact", "blur", "radius", "strength", "hide", "censor"],
            warnBelow: {
              value: 3,
              message:
                "A blur under 3 px may not hide text: some tools can read blurred text back. Use Solid for passwords and other secrets.",
            },
          },
        ],
      },
      {
        title: "Spotlight",
        items: [
          {
            id: "styles-spotlight",
            kind: "numberPicker",
            path: "styles.spotlight",
            label: "Darkness choices",
            description:
              "How dark the spotlight tool makes everything outside it, in percent. Keys 1–9 and 0 pick them while you draw. Values above 100 are lowered to 100.",
            unit: "%",
            keywords: ["spotlight", "dim", "darken", "darkness", "opacity", "focus", "highlight"],
          },
        ],
      },
      {
        title: "Rounded corners",
        items: [
          {
            id: "styles-corner-radius",
            kind: "numberPicker",
            path: "styles.cornerRadius",
            label: "Corner radius choices",
            description:
              "The corner radii the rectangle and the spotlight's rectangle offer, in pixels. 0 (square corners) is always one of them. Alt+1–9 and Alt+0 pick them while you draw.",
            unit: "px",
            zero: true,
            noButtons: true,
            keywords: ["corner", "round", "rounded", "radius", "rectangle", "spotlight", "square"],
          },
        ],
      },
      {
        title: "Step markers",
        items: [
          {
            id: "styles-step-size",
            kind: "numberPicker",
            path: "styles.stepSize",
            label: "Marker sizes",
            description:
              "The sizes the step tool offers, in pixels across. Keys 1–9 and 0 pick them while you place markers.",
            unit: "px",
            keywords: ["step", "marker", "number", "numbered", "size", "badge", "counter"],
          },
          {
            id: "styles-step-fonts",
            kind: "fontPicker",
            path: "styles.stepFont",
            label: "Marker fonts",
            description:
              "The fonts the step tool offers for its labels. Same as Text tool uses the fonts chosen above. With a custom list, Alt+1–9 and Alt+0 pick them.",
            keywords: ["step", "marker", "font", "typeface", "label", "number", "text"],
          },
        ],
      },
      {
        title: "Per-tool styles",
        description:
          "Give a tool its own colors, widths or way of showing colors instead of the ones above. The highlighter comes with its own colors.",
        items: [
          {
            id: "tool-style-pen",
            kind: "toolStyle",
            tool: "pen",
            label: "Pen",
            widths: true,
            keywords: ["own", "custom", "override", "per tool", "palette", "color", "width"],
          },
          {
            id: "tool-style-highlighter",
            kind: "toolStyle",
            tool: "highlighter",
            label: "Highlighter",
            widths: true,
            keywords: ["own", "custom", "override", "per tool", "palette", "color", "width"],
          },
          {
            id: "tool-style-line",
            kind: "toolStyle",
            tool: "line",
            label: "Line",
            widths: true,
            keywords: ["own", "custom", "override", "per tool", "palette", "color", "width"],
          },
          {
            id: "tool-style-arrow",
            kind: "toolStyle",
            tool: "arrow",
            label: "Arrow",
            widths: true,
            keywords: ["own", "custom", "override", "per tool", "palette", "color", "width"],
          },
          {
            id: "tool-style-rect",
            kind: "toolStyle",
            tool: "rect",
            label: "Rectangle",
            widths: true,
            keywords: ["own", "custom", "override", "per tool", "palette", "color", "width"],
          },
          {
            id: "tool-style-ellipse",
            kind: "toolStyle",
            tool: "ellipse",
            label: "Ellipse",
            widths: true,
            keywords: ["own", "custom", "override", "per tool", "palette", "color", "width"],
          },
          {
            id: "tool-style-text",
            kind: "toolStyle",
            tool: "text",
            label: "Text",
            widths: false,
            keywords: ["own", "custom", "override", "per tool", "palette", "color"],
          },
          {
            id: "tool-style-callout",
            kind: "toolStyle",
            tool: "callout",
            label: "Callout",
            widths: true,
            keywords: ["own", "custom", "override", "per tool", "palette", "color", "pointer"],
          },
          {
            id: "tool-style-step",
            kind: "toolStyle",
            tool: "step",
            label: "Step markers",
            widths: false,
            keywords: ["own", "custom", "override", "per tool", "palette", "color", "marker"],
          },
        ],
      },
    ],
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    icon: KeyboardIcon,
    description:
      "The capture shortcuts, which work anywhere in Windows, and the markup tools' keys.",
    groups: [
      {
        title: "Capture",
        description: "They work anywhere in Windows. Click Change, then press the new shortcut.",
        items: [
          {
            id: "hotkey-region",
            kind: "hotkey",
            path: "hotkeys.region",
            label: "Capture a region",
            keywords: ["hotkey", "shortcut", "keyboard", "key", "printscreen"],
          },
          {
            id: "hotkey-window",
            kind: "hotkey",
            path: "hotkeys.window",
            label: "Capture a window",
            keywords: ["hotkey", "shortcut", "keyboard", "key", "window", "printscreen"],
          },
          {
            id: "hotkey-fullscreen",
            kind: "hotkey",
            path: "hotkeys.fullscreen",
            label: "Capture the full screen",
            description: "The screen the pointer is on",
            keywords: ["hotkey", "shortcut", "keyboard", "key", "monitor", "printscreen"],
          },
          {
            id: "hotkey-all-screens",
            kind: "hotkey",
            path: "hotkeys.allScreens",
            label: "Capture all screens",
            description: "Every screen as one image",
            keywords: ["hotkey", "shortcut", "keyboard", "key", "all monitors", "printscreen"],
          },
        ],
      },
      {
        title: "Tools",
        description:
          "In quick edit and the editor. Click Change, then press a letter, alone or with Ctrl, Alt or Shift.",
        items: (Object.keys(SHORTCUT_NAMES) as ShortcutId[]).map((shortcut) => ({
          id: `shortcut-${shortcut}`,
          kind: "shortcut" as const,
          shortcut,
          label: SHORTCUT_NAMES[shortcut],
          description: shortcut === "crop" ? "In the editor" : undefined,
          keywords: ["shortcut", "keyboard", "key", "tool"],
        })),
      },
      {
        title: "Other shortcuts",
        description: "These can't be changed.",
        items: (
          [
            ["keys-markup", "Marking up", "In quick edit and the editor", MARKUP_KEYS],
            ["keys-quick-edit", "Quick edit", undefined, QUICK_EDIT_KEYS],
            ["keys-editor", "Editor", undefined, EDITOR_KEYS],
          ] as const
        ).map(([id, label, description, entries]) => ({
          id,
          kind: "keyList" as const,
          label,
          description,
          entries,
          // Found by what they do: "duplicate", "zoom"...
          keywords: ["shortcut", "keyboard", "key", ...entries.flatMap((e) => [e.what, ...e.keys])],
        })),
      },
    ],
  },
  {
    id: "about",
    title: "About",
    icon: AboutIcon,
    groups: [
      {
        items: [
          {
            id: "about",
            kind: "about",
            label: "About Vandal",
            keywords: ["version", "author", "copyright", "license", "github", "website"],
          },
        ],
      },
    ],
  },
];
