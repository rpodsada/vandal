import { Dropdown } from "../../markup/Dropdown";
import markup from "../../markup/options.module.css";
import type { ChoiceItem } from "../schema";
import { useSetting } from "../store";
import type { ControlProps } from "./index";
import { Segmented } from "./Segmented";

/** One value from a fixed list: joined buttons for a few, a dropdown for more. */
export function Choice({ item, id, disabled }: ControlProps<ChoiceItem>) {
  const [value, setValue] = useSetting(item.path);
  if (item.control === "select") {
    const current = item.options.find((o) => o.value === value) ?? item.options[0];
    return (
      // The editor's options-bar dropdown, in the context it's styled for.
      <div className={markup.options}>
        <Dropdown
          id={id}
          className={markup.dropdown}
          title={item.label}
          disabled={disabled}
          // Settings' controls sit at the right edge of their row.
          align="end"
          button={<span>{current?.label}</span>}
        >
          {(close) =>
            item.options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                className={markup.menuRow}
                onClick={() => {
                  setValue(o.value);
                  close();
                }}
              >
                <span className={markup.menuLabel}>{o.label}</span>
              </button>
            ))
          }
        </Dropdown>
      </div>
    );
  }
  return (
    <Segmented
      id={id}
      label={item.label}
      options={item.options}
      value={value}
      disabled={disabled}
      onChange={setValue}
    />
  );
}
