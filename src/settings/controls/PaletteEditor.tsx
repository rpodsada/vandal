import { useRef, useState, type PointerEvent } from "react";
import { ColorPicker } from "../../markup/ColorPicker";
import { boxOf, useMenuPlacement } from "../../markup/menuPlacement";
import { usePopover } from "../../markup/usePopover";
import markup from "../../markup/options.module.css";
import { PlusIcon } from "../icons";
import type { PaletteItem } from "../schema";
import { dropIndex, MAX_COLORS, moveItem, paletteError } from "../paletteSpec";
import { useSetting } from "../store";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

/** The global palette setting. */
export function PaletteSetting({ item, id, disabled }: ControlProps<PaletteItem>) {
  const [colors, setColors] = useSetting(item.path);
  return (
    <PaletteEditor
      id={id}
      colors={colors}
      label={item.label}
      disabled={disabled}
      onChange={setColors}
    />
  );
}

interface Props {
  id?: string;
  colors: string[];
  label: string;
  disabled?: boolean;
  onChange: (colors: string[]) => void;
}

/** What the color popover is editing: a preset, or a new one (`index` null). */
interface Edit {
  index: number | null;
  color: string;
}

interface Drag {
  from: number;
  pointerId: number;
  startX: number;
  x: number;
  centers: number[];
  moved: boolean;
  to: number;
}

/**
 * A palette (PLAN 2C.2): its colors in order. Click a color to change or
 * remove it, drag it (or Alt+←/→) to reorder, + to add one. At most 10
 * colors, at least one, no duplicates. Reused for the per-tool palettes.
 */
export function PaletteEditor({ id, colors, label, disabled, onChange }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // While dragging, the swatches keep their DOM order (so the pointer stays
  // captured) and slide into place; the dragged one follows the pointer.
  const order = drag?.moved ? moveItem([...colors.keys()], drag.from, drag.to) : null;
  const offset = (i: number) => {
    if (!drag || !order) return 0;
    if (i === drag.from) return drag.x - drag.startX;
    return drag.centers[order.indexOf(i)] - drag.centers[i];
  };

  const swatchAt = (i: number) => rowRef.current?.children[i] as HTMLElement | undefined;

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    if (e.button !== 0 || disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const centers = colors.map((_, j) => {
      const r = swatchAt(j)!.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    setDrag({
      from: i,
      pointerId: e.pointerId,
      startX: e.clientX,
      x: e.clientX,
      centers,
      moved: false,
      to: i,
    });
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = drag.moved || Math.abs(e.clientX - drag.startX) > 4;
    if (moved)
      setDrag({ ...drag, moved, x: e.clientX, to: dropIndex(drag.centers, drag.from, e.clientX) });
  };

  const onPointerUp = (i: number) => {
    if (!drag) return;
    setDrag(null);
    if (!drag.moved) setEdit({ index: i, color: colors[i] });
    else if (drag.to !== drag.from) onChange(moveItem(colors, drag.from, drag.to));
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const to = i + (e.key === "ArrowLeft" ? -1 : 1);
    if (to < 0 || to >= colors.length) return;
    onChange(moveItem(colors, i, to));
    // Keep the moved color focused.
    requestAnimationFrame(() => swatchAt(to)?.focus());
  };

  return (
    <div className={styles.controlGroup}>
      <div id={id} ref={rowRef} className={styles.palette} role="list" aria-label={label}>
        {colors.map((color, i) => {
          const editing = edit?.index === i;
          const dragged = drag?.moved && i === drag.from;
          return (
            <button
              key={color}
              type="button"
              role="listitem"
              className={styles.paletteSwatch}
              style={{
                background: editing ? edit.color : color,
                transform: order ? `translateX(${offset(i)}px)` : undefined,
              }}
              data-dragging={dragged || undefined}
              aria-pressed={editing}
              aria-label={`Color ${i + 1}: ${color}`}
              title={`${color} · click to change, drag to reorder`}
              disabled={disabled}
              onPointerDown={(e) => onPointerDown(e, i)}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(i)}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(e) => {
                onKeyDown(e, i);
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEdit({ index: i, color });
                }
              }}
            />
          );
        })}
        {colors.length < MAX_COLORS && (
          <button
            type="button"
            className={styles.paletteAdd}
            aria-label={`Add a color to ${label.toLowerCase()}`}
            title="Add a color"
            disabled={disabled}
            aria-pressed={edit?.index === null}
            onClick={() => setEdit({ index: null, color: colors[colors.length - 1] ?? "#808080" })}
          >
            {edit?.index === null ? (
              <span className={styles.paletteNew} style={{ background: edit.color }} />
            ) : (
              <PlusIcon />
            )}
          </button>
        )}
        <span className={styles.help}>
          {colors.length} of {MAX_COLORS}
        </span>
      </div>
      {edit && (
        <ColorPopover
          key={edit.index ?? "new"}
          edit={edit}
          colors={colors}
          anchor={() => boxOf(edit.index === null ? swatchAt(colors.length) : swatchAt(edit.index))}
          onDraft={(color) => setEdit({ ...edit, color })}
          onDone={(next) => {
            setEdit(null);
            if (next) onChange(next);
          }}
        />
      )}
    </div>
  );
}

/** Changing (or adding, or removing) one color, with the editor's color picker. */
function ColorPopover({
  edit,
  colors,
  anchor,
  onDraft,
  onDone,
}: {
  edit: Edit;
  colors: string[];
  anchor: () => ReturnType<typeof boxOf>;
  onDraft: (color: string) => void;
  /** The new palette, or null for no change. */
  onDone: (colors: string[] | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isNew = edit.index === null;
  const error = paletteError(colors, edit.color, edit.index);
  useMenuPlacement(true, ref, anchor);

  const keep = () => {
    if (error) return onDone(null);
    if (isNew) return onDone([...colors, edit.color]);
    if (colors[edit.index!] === edit.color) return onDone(null);
    onDone(colors.map((c, i) => (i === edit.index ? edit.color : c)));
  };
  // Enter or a click elsewhere keeps; Esc cancels.
  usePopover(true, ref, (k) => (k ? keep() : onDone(null)), "keep");

  return (
    <div
      ref={ref}
      className={`${markup.menu} ${markup.colorMenu}`}
      role="dialog"
      aria-label={isNew ? "New color" : `Color ${edit.index! + 1}`}
    >
      <ColorPicker value={edit.color} onChange={onDraft} />
      {error && <div className={markup.colorError}>{error}</div>}
      <div className={markup.colorActions}>
        {!isNew && (
          <button
            type="button"
            className={`${markup.ghostButton} ${markup.deleteButton}`}
            disabled={colors.length === 1}
            title={colors.length === 1 ? "A palette needs at least one color" : undefined}
            onClick={() => onDone(colors.filter((_, i) => i !== edit.index))}
          >
            Remove
          </button>
        )}
        <span className={markup.spacer} />
        <button type="button" className={markup.ghostButton} onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" className={markup.accentButton} disabled={!!error} onClick={keep}>
          {isNew ? "Add" : "Done"}
        </button>
      </div>
    </div>
  );
}
