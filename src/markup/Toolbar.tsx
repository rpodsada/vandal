import type { ReactNode } from "react";
import { canRedo, canUndo, docStore, useDoc } from "./model/store";
import { useToolStore, type ToolId } from "./toolStore";
import styles from "./markup.module.css";

const TOOL_BUTTONS: { id: ToolId; label: string; key: string; icon: ReactNode }[] = [
  { id: "select", label: "Select", key: "V", icon: <path d="M6 3.5l12 7.2-5.4 1.4-2.6 5.4z" /> },
  {
    id: "pen",
    label: "Pen",
    key: "P",
    icon: (
      <>
        <path d="M4 20l1-4L16 5l3 3L8 19z" />
        <path d="M14 7l3 3" />
      </>
    ),
  },
  {
    id: "highlighter",
    label: "Highlighter",
    key: "H",
    icon: (
      <>
        <path d="M9 15l-2 5h5l1-2" />
        <path d="M9 15l8-11 4 3-8 11z" />
      </>
    ),
  },
  { id: "line", label: "Line", key: "L", icon: <path d="M5 19L19 5" /> },
  {
    id: "arrow",
    label: "Arrow",
    key: "A",
    icon: (
      <>
        <path d="M5 19L19 5" />
        <path d="M10 5h9v9" />
      </>
    ),
  },
  {
    id: "rect",
    label: "Rectangle",
    key: "R",
    icon: <rect x="4" y="6" width="16" height="12" rx="1" />,
  },
  {
    id: "ellipse",
    label: "Ellipse",
    key: "E",
    icon: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />,
  },
  {
    id: "text",
    label: "Text",
    key: "T",
    icon: <path d="M5 7V5h14v2M12 5v14M9 19h6" />,
  },
];

/** Tools, then undo/redo. Shared by quick edit and the editor (PLAN §4.6). */
export function Toolbar() {
  const tool = useToolStore((s) => s.tool);
  const undoable = useDoc(canUndo);
  const redoable = useDoc(canRedo);

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Tools">
      {TOOL_BUTTONS.map((b) => (
        <button
          key={b.id}
          type="button"
          className={styles.tool}
          aria-label={`${b.label} (${b.key})`}
          aria-pressed={tool === b.id}
          title={`${b.label} (${b.key})`}
          onClick={() => useToolStore.getState().setTool(b.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            {b.icon}
          </svg>
        </button>
      ))}
      <span className={styles.toolbarDivider} />
      <button
        type="button"
        className={styles.tool}
        aria-label="Undo (Ctrl+Z)"
        title="Undo (Ctrl+Z)"
        disabled={!undoable}
        onClick={() => docStore.getState().undo()}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.tool}
        aria-label="Redo (Ctrl+Y)"
        title="Redo (Ctrl+Y)"
        disabled={!redoable}
        onClick={() => docStore.getState().redo()}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M15 14l5-5-5-5" />
          <path d="M20 9H10a6 6 0 0 0 0 12h3" />
        </svg>
      </button>
    </div>
  );
}
