// The settings schema: what the settings window shows, declared as data.
//
// To add a setting, add an item to a group in `sections.tsx`. To add a new
// kind of control, add an item type to `Item` below and a component to the
// registry in `controls/index.ts` (TypeScript will insist on both).
import type { ComponentType } from "react";
import type { ShortcutId } from "../markup/shortcuts";
import type { ToolId } from "../markup/toolStore";
import type { Settings } from "../shared/ipc";
import type { PathOf } from "./path";

interface BaseItem {
  /** Stable id: used as the React key and the control's DOM id. */
  id: string;
  label: string;
  description?: string;
  /** Extra words that should find this setting in search. */
  keywords?: string[];
  /** Hide the row entirely when false. */
  visible?: (s: Settings) => boolean;
  /** Grey the row out when true (keep it visible so it's discoverable). */
  disabled?: (s: Settings) => boolean;
}

export interface ToggleItem extends BaseItem {
  kind: "toggle";
  path: PathOf<Settings, boolean>;
}

export interface TextItem extends BaseItem {
  kind: "text";
  path: PathOf<Settings, string>;
  placeholder?: string;
  /** Live preview under the input, e.g. an example file name. */
  preview?: (value: string) => Promise<string>;
  /** Small help text under the input (e.g. available tokens). */
  help?: string;
}

export interface FolderItem extends BaseItem {
  kind: "folder";
  path: PathOf<Settings, string>;
}

export interface SliderItem extends BaseItem {
  kind: "slider";
  path: PathOf<Settings, number>;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
}

/** One of a fixed set of strings: joined buttons (default) or a dropdown. */
export interface ChoiceItem extends BaseItem {
  kind: "choice";
  path: PathOf<Settings, string>;
  options: readonly { value: string; label: string }[];
  control?: "segmented" | "select";
}

/** A number picker spec (PLAN 2C): its control type and values. */
export interface NumberPickerItem extends BaseItem {
  kind: "numberPicker";
  /** Picker specs are objects, so these aren't typed leaf paths. */
  path:
    | "styles.width"
    | "styles.fontSize"
    | "styles.pixelate"
    | "styles.blur"
    | "styles.spotlight"
    | "styles.stepSize"
    | "styles.cornerRadius";
  unit: "px" | "pt" | "%";
  /** 0 is always a choice, first in the list or the slider's start (PLAN 3D.18). */
  zero?: boolean;
  /** No "Buttons" control (it read as more buttons beside Spotlight's). */
  noButtons?: boolean;
  /** Preview the values as lines of that thickness. */
  lines?: boolean;
}

/** A color palette (PLAN 2C.2): up to 10 colors in the user's order. */
export interface PaletteItem extends BaseItem {
  kind: "palette";
  path: PathOf<Settings, string[]>;
}

/** One tool's own colors and widths, instead of the shared ones (PLAN 2C.2). */
export interface ToolStyleItem extends BaseItem {
  kind: "toolStyle";
  tool: ToolId;
  /** The tool draws lines, so a width override applies. */
  widths: boolean;
}

/**
 * A tool's fonts (PLAN 2C.3): the text tool's, or the step markers', which
 * can also follow the text tool's (PLAN 3D.13).
 */
export interface FontPickerItem extends BaseItem {
  kind: "fontPicker";
  path: "styles.font" | "styles.stepFont";
}

/** The accent color: the Windows accent, a preset or a custom color (PLAN 3A.2). */
export interface AccentItem extends BaseItem {
  kind: "accent";
  path: PathOf<Settings, string>;
}

/** A global shortcut, recorded by pressing it (PLAN 3B). */
export interface HotkeyItem extends BaseItem {
  kind: "hotkey";
  path: PathOf<Settings, string | null>;
}

/** A markup shortcut (PLAN 3F): a letter, alone or with Ctrl, Alt and Shift. */
export interface ShortcutItem extends BaseItem {
  kind: "shortcut";
  shortcut: ShortcutId;
}

/** Read-only value, for things not editable yet or informational. */
export interface InfoItem extends BaseItem {
  kind: "info";
  value: (s: Settings) => string;
}

export type Item =
  | ToggleItem
  | TextItem
  | FolderItem
  | SliderItem
  | ChoiceItem
  | NumberPickerItem
  | PaletteItem
  | ToolStyleItem
  | FontPickerItem
  | AccentItem
  | HotkeyItem
  | ShortcutItem
  | InfoItem;
export type ItemKind = Item["kind"];

export interface Group {
  title?: string;
  description?: string;
  items: Item[];
}

export interface Section {
  id: string;
  title: string;
  icon: ComponentType;
  description?: string;
  groups: Group[];
}

/** Does `item` match every word of `query` (case-insensitive)? */
export function matchesQuery(item: Item, section: Section, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [item.label, item.description, section.title, ...(item.keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((w) => haystack.includes(w));
}
