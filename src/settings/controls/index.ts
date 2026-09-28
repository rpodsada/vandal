// Control registry: one component per item kind. Adding a kind to `Item` in
// schema.ts without registering it here is a type error.
import type { ComponentType } from "react";
import type { Item, ItemKind } from "../schema";
import { Choice } from "./Choice";
import { FolderInput } from "./FolderInput";
import { Info } from "./Info";
import { NumberPickerSetting } from "./NumberPickerEditor";
import { Slider } from "./Slider";
import { TextInput } from "./TextInput";
import { Toggle } from "./Toggle";

export interface ControlProps<I extends Item> {
  item: I;
  /** DOM id for the control, so the row's label can point at it. */
  id: string;
  disabled: boolean;
}

interface ControlDef<I extends Item> {
  component: ComponentType<ControlProps<I>>;
  /** `inline`: control to the right of the label. `stacked`: full width below. */
  layout: "inline" | "stacked";
}

type Registry = { [K in ItemKind]: ControlDef<Extract<Item, { kind: K }>> };

export const controls: Registry = {
  toggle: { component: Toggle, layout: "inline" },
  slider: { component: Slider, layout: "inline" },
  info: { component: Info, layout: "inline" },
  choice: { component: Choice, layout: "inline" },
  numberPicker: { component: NumberPickerSetting, layout: "stacked" },
  text: { component: TextInput, layout: "stacked" },
  folder: { component: FolderInput, layout: "stacked" },
};
