import { hint } from "./HintLine";
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
  {
    id: "callout",
    label: "Callout",
    key: "O",
    // A box of text with a pointer down to the left.
    icon: (
      <>
        <rect x="9" y="3.5" width="12" height="9" rx="2" />
        <path d="M12 8h6M12.5 12.5L4 20.5" />
        <circle cx="4" cy="20.5" r="0.6" />
      </>
    ),
  },
  {
    id: "redact",
    label: "Redact",
    key: "B",
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 12h16M12 4v16" />
        <path d="M4.8 4.8h7.2v7.2H4.8zM12 12h7.2v7.2H12z" fill="currentColor" opacity="0.45" />
      </>
    ),
  },
  {
    id: "spotlight",
    label: "Spotlight",
    key: "S",
    icon: (
      <>
        <path
          d="M3 5h18v14H3zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z"
          fill="currentColor"
          fillRule="evenodd"
          stroke="none"
          opacity="0.45"
        />
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
  },
  {
    id: "step",
    label: "Step",
    key: "N",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M10.3 9.4L12.6 7.8v8.4" />
      </>
    ),
  },
];

interface Props {
  /** Host-only buttons after the tools (the editor's crop). */
  extra?: ReactNode;
  /** False while a host mode (crop) is active instead of a tool. */
  toolsActive?: boolean;
  /** Before a tool is picked (the editor applies a crop in progress). */
  onPickTool?: (tool: ToolId) => void;
}

/** Tools, then undo/redo. Shared by quick edit and the editor (PLAN §4.6). */
export function Toolbar({ extra, toolsActive = true, onPickTool }: Props) {
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
          {...hint(`tool.${b.id}`)}
          aria-label={`${b.label} (${b.key})`}
          aria-pressed={toolsActive && tool === b.id}
          title={`${b.label} (${b.key})`}
          onClick={() => {
            onPickTool?.(b.id);
            useToolStore.getState().setTool(b.id);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            {b.icon}
          </svg>
        </button>
      ))}
      {extra}
      <span className={styles.toolbarDivider} />
      <button
        type="button"
        className={styles.tool}
        {...hint("undo")}
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
        {...hint("redo")}
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
