// Every setting in the settings window, declared as data. See schema.ts.
import pkg from "../../package.json";
import { commands } from "../shared/ipc";
import { AboutIcon, CaptureIcon, EditorIcon, GeneralIcon, SaveIcon } from "./icons";
import type { Section } from "./schema";

export const sections: Section[] = [
  {
    id: "general",
    title: "General",
    icon: GeneralIcon,
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
    ],
  },
  {
    id: "capture",
    title: "Capture",
    icon: CaptureIcon,
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
    ],
  },
  {
    id: "saving",
    title: "Saving",
    icon: SaveIcon,
    groups: [
      {
        title: "After you capture",
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
        title: "Quick access",
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
    id: "editor",
    title: "Editor",
    icon: EditorIcon,
    groups: [
      {
        title: "When you close the editor",
        description: "Skipped if you already copied or saved since your last change.",
        items: [
          {
            id: "editor-close-copy",
            kind: "toggle",
            path: "editor.onClose.copy",
            label: "Copy to clipboard",
            keywords: ["close", "exit", "paste"],
          },
          {
            id: "editor-close-save",
            kind: "toggle",
            path: "editor.onClose.save",
            label: "Save to a file",
            description:
              "Uses the folder and file name from Saving. With neither option on, you're asked before unsaved changes are lost.",
            keywords: ["close", "exit", "auto-save", "autosave"],
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
