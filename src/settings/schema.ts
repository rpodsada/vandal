// The settings schema: what the settings window shows, declared as data.
//
// To add a setting, add an item to a group in `sections.tsx`. To add a new
// kind of control, add an item type to `Item` below and a component to the
// registry in `controls/index.ts` (TypeScript will insist on both).
import type { ComponentType } from "react";
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

/** Read-only value, for things not editable yet or informational. */
export interface InfoItem extends BaseItem {
  kind: "info";
  value: (s: Settings) => string;
}

export type Item = ToggleItem | TextItem | FolderItem | SliderItem | InfoItem;
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
