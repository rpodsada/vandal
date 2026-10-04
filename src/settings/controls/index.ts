// Control registry: one component per item kind. Adding a kind to `Item` in
// schema.ts without registering it here is a type error.
import type { ComponentType } from "react";
import type { Item, ItemKind } from "../schema";
import { AccentPicker } from "./AccentPicker";
import { Choice } from "./Choice";
import { FolderInput } from "./FolderInput";
import { HotkeyField } from "./HotkeyField";
import { FontPickerSetting } from "./FontPickerEditor";
import { AboutCard } from "./AboutCard";
import { UpdatesCard } from "./UpdatesCard";
import { Info } from "./Info";
import { KeyList } from "./KeyList";
import { ShortcutField } from "./ShortcutField";
import { NumberPickerSetting } from "./NumberPickerEditor";
import { PaletteSetting } from "./PaletteEditor";
import { Slider } from "./Slider";
import { TextInput } from "./TextInput";
import { ToolStyleSetting } from "./ToolStyleEditor";
import { Toggle } from "./Toggle";

export interface ControlProps<I extends Item> {
  item: I;
  /** DOM id for the control, so the row's label can point at it. */
  id: string;
  disabled: boolean;
}

interface ControlDef<I extends Item> {
  component: ComponentType<ControlProps<I>>;
  /**
   * `inline`: control to the right of the label. `stacked`: full width below.
   * `bare`: the control alone, its label only for search.
   */
  layout: "inline" | "stacked" | "bare";
}

type Registry = { [K in ItemKind]: ControlDef<Extract<Item, { kind: K }>> };

export const controls: Registry = {
  toggle: { component: Toggle, layout: "inline" },
  slider: { component: Slider, layout: "inline" },
  info: { component: Info, layout: "inline" },
  choice: { component: Choice, layout: "inline" },
  numberPicker: { component: NumberPickerSetting, layout: "stacked" },
  palette: { component: PaletteSetting, layout: "stacked" },
  toolStyle: { component: ToolStyleSetting, layout: "stacked" },
  fontPicker: { component: FontPickerSetting, layout: "stacked" },
  accent: { component: AccentPicker, layout: "stacked" },
  hotkey: { component: HotkeyField, layout: "stacked" },
  shortcut: { component: ShortcutField, layout: "inline" },
  keyList: { component: KeyList, layout: "stacked" },
  about: { component: AboutCard, layout: "bare" },
  updates: { component: UpdatesCard, layout: "bare" },
  text: { component: TextInput, layout: "stacked" },
  folder: { component: FolderInput, layout: "stacked" },
};
