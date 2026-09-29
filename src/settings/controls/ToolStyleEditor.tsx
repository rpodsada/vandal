import { DEFAULT_STYLE_CONFIG } from "../../markup/styles";
import type { NumberPicker, StyleSettings } from "../../shared/ipc";
import type { ToolStyleItem } from "../schema";
import { useSettingsStore } from "../store";
import type { ControlProps } from "./index";
import { NumberPickerEditor } from "./NumberPickerEditor";
import { PaletteEditor } from "./PaletteEditor";
import { Switch } from "./Switch";
import styles from "./controls.module.css";

type ToolStyles = StyleSettings["tools"][string];

/**
 * Overrides switched off this session, by tool: switching back on brings
 * them back instead of starting over.
 */
const setAside = new Map<string, Partial<ToolStyles>>();

/**
 * One tool's own colors and widths (PLAN 2C.2): a switch for each, with its
 * palette / width editor under it while it's on. Off, the tool uses the
 * shared ones.
 */
export function ToolStyleSetting({ item, id, disabled }: ControlProps<ToolStyleItem>) {
  const settings = useSettingsStore((s) => s.settings!);
  const set = useSettingsStore((s) => s.set);
  const tools = settings.styles.tools;
  const own: ToolStyles = tools[item.tool] ?? { palette: null, width: null };
  const shipped = DEFAULT_STYLE_CONFIG.styles.tools[item.tool];

  const update = (patch: Partial<ToolStyles>) => {
    const next = { ...own, ...patch };
    const all = { ...tools };
    if (next.palette || next.width) all[item.tool] = next;
    else delete all[item.tool];
    // The map of overrides is an object, which typed leaf paths don't reach.
    void set("styles.tools" as never, all as never);
  };

  const switchPalette = (on: boolean) => {
    if (!on) {
      setAside.set(item.tool, { ...setAside.get(item.tool), palette: own.palette });
      return update({ palette: null });
    }
    const palette = setAside.get(item.tool)?.palette ?? shipped?.palette ?? settings.styles.palette;
    update({ palette: [...palette] });
  };

  const switchWidth = (on: boolean) => {
    if (!on) {
      setAside.set(item.tool, { ...setAside.get(item.tool), width: own.width });
      return update({ width: null });
    }
    const width = setAside.get(item.tool)?.width ?? shipped?.width ?? settings.styles.width;
    update({ width: structuredClone(width) as NumberPicker });
  };

  return (
    <div className={styles.overrides} id={id}>
      <div className={styles.override}>
        <label className={styles.overrideSwitch}>
          <span className={styles.overrideLabel}>Custom colors</span>
          <Switch
            checked={!!own.palette}
            disabled={disabled}
            label={`${item.label}: custom colors`}
            onChange={switchPalette}
          />
        </label>
        {own.palette && (
          <PaletteEditor
            colors={own.palette}
            label={`${item.label} colors`}
            disabled={disabled}
            onChange={(palette) => update({ palette })}
          />
        )}
      </div>
      {item.widths && (
        <div className={styles.override}>
          <label className={styles.overrideSwitch}>
            <span className={styles.overrideLabel}>Custom widths</span>
            <Switch
              checked={!!own.width}
              disabled={disabled}
              label={`${item.label}: custom widths`}
              onChange={switchWidth}
            />
          </label>
          {own.width && (
            <NumberPickerEditor
              picker={own.width}
              label={`${item.label} width`}
              unit="px"
              lines
              disabled={disabled}
              onChange={(width) => update({ width })}
            />
          )}
        </div>
      )}
    </div>
  );
}
