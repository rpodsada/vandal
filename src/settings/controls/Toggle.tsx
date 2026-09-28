import type { ToggleItem } from "../schema";
import { useSetting } from "../store";
import type { ControlProps } from "./index";
import { Switch } from "./Switch";

export function Toggle({ item, id, disabled }: ControlProps<ToggleItem>) {
  const [value, setValue] = useSetting(item.path);
  return <Switch id={id} checked={value} disabled={disabled} onChange={setValue} />;
}
