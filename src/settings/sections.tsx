// Every setting in the settings window, declared as data. See schema.ts.
//
// Pages follow the capture flow (PLAN §4.7): General (the app itself),
// Capture (taking the shot), Copy & save (where the image goes), Markup (tools
// and styles, shared by quick edit and the editor), About.
import pkg from "../../package.json";
import { commands } from "../shared/ipc";
import { AboutIcon, CaptureIcon, GeneralIcon, MarkupIcon, SaveIcon } from "./icons";
import type { Section } from "./schema";

export const sections: Section[] = [
  {
    id: "general",
    title: "General",
    icon: GeneralIcon,
    description: "How the app starts, its notifications and its tray menu.",
    groups: [
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
        title: "Notifications",
        items: [
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
      {
        title: "Tray menu",
        items: [
          {
            id: "tray-auto-save-toggle",
            kind: "toggle",
            path: "tray.showAutoSaveToggle",
            label: "Auto-save switch in the tray menu",
            description: "Turn automatic saving on or off from the tray icon's menu.",
            keywords: ["tray", "menu", "auto-save", "autosave"],
          },
        ],
      },
    ],
  },
  {
    id: "capture",
    title: "Capture",
    icon: CaptureIcon,
    description: "Taking a screenshot: shortcuts, the selection screen and quick edit.",
    groups: [
      {
        title: "Keyboard shortcuts",
        description: "Changing shortcuts is coming in a later update.",
        items: [
          {
            id: "hotkey-region",
            kind: "info",
            label: "Capture a region",
            value: (s) => s.hotkeys.region ?? "Not set",
            keywords: ["hotkey", "shortcut"],
          },
          {
            id: "hotkey-fullscreen",
            kind: "info",
            label: "Capture the full screen",
            value: (s) => s.hotkeys.fullscreen ?? "Not set",
            keywords: ["hotkey", "shortcut", "all monitors"],
          },
        ],
      },
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
            help: "Use {yyyy} {MM} {dd} for the date and {HH} {mm} {ss} for the time.",
            keywords: ["name", "template", "pattern"],
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
            id: "version",
            kind: "info",
            label: "Version",
            value: () => pkg.version,
          },
        ],
      },
    ],
  },
];
