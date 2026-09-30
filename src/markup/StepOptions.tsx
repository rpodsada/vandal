import { useRef, useState, type ReactNode } from "react";
import { hint } from "./HintLine";
import { boxOf, useMenuPlacement } from "./menuPlacement";
import { useDoc } from "./model/store";
import type { StepFormat, StepShape } from "./model/types";
import { NumberPickerControl } from "./NumberPickerControl";
import {
  applyStyle,
  beginStyleDrag,
  endStyleDrag,
  resetStepStyles,
  type TargetValues,
} from "./restyle";
import { parseStepStart, stepLabel, stepResetEffect, stepsOf, type StepStyle } from "./steps";
import { STEP_SIZE_PICKER } from "./styles";
import { usePopover } from "./usePopover";
import styles from "./options.module.css";

const SHAPES: { id: StepShape; label: string; icon: ReactNode }[] = [
  { id: "circle", label: "Circle", icon: <circle cx="12" cy="12" r="8" /> },
  { id: "square", label: "Square", icon: <rect x="4" y="4" width="16" height="16" /> },
  {
    id: "rounded",
    label: "Rounded square",
    icon: <rect x="4" y="4" width="16" height="16" rx="5" />,
  },
];

const FORMATS: { id: StepFormat; label: string; text: string }[] = [
  { id: "numbers", label: "Numbers", text: "1 2 3" },
  { id: "letters", label: "Letters", text: "A B C" },
];

interface Props {
  step: NonNullable<TargetValues["step"]>;
  hints: boolean;
  showKeys: boolean;
}

/** The step marker's options (PLAN 3D.11): shape, size, labels, and Reset styles. */
export function StepOptions({ step, hints, showKeys }: Props) {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.group} {...hint("step.shape")}>
          {SHAPES.map((sh) => (
            <button
              key={sh.id}
              type="button"
              className={styles.toggle}
              aria-pressed={step.shape === sh.id}
              aria-label={sh.label}
              title={sh.label}
              onClick={() => applyStyle({ stepShape: sh.id })}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                {sh.icon}
              </svg>
            </button>
          ))}
        </div>
        <span className={styles.hintArea} {...hint("size")}>
          <NumberPickerControl
            picker={STEP_SIZE_PICKER}
            value={step.size}
            unit="px"
            label="Size"
            showKeys={showKeys}
            hints={hints}
            onPick={(stepSize) => applyStyle({ stepSize })}
            onDragStart={beginStyleDrag}
            onDragEnd={endStyleDrag}
          />
        </span>
      </div>
      <div className={styles.section}>
        <div className={styles.group} {...hint("step.format")}>
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`${styles.toggle} ${styles.stepFormat}`}
              aria-pressed={step.format === f.id}
              aria-label={f.label}
              title={f.label}
              onClick={() => applyStyle({ stepFormat: f.id })}
            >
              {f.text}
            </button>
          ))}
        </div>
        <StartField format={step.format} start={step.start} />
        <ResetStyles style={step} />
      </div>
    </>
  );
}

/** The first auto label, typed as a number or a letter. */
function StartField({ format, start }: { format: StepFormat; start: number }) {
  // What's being typed; null shows the value.
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  return (
    <label className={styles.sizeField} {...hint("step.start")}>
      <span>Start at</span>
      <input
        className={`${styles.colorField} ${styles.stepStart}`}
        aria-label="Start at"
        spellCheck={false}
        maxLength={format === "numbers" ? 4 : 3}
        value={draft ?? stepLabel(start, format)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = draft === null || cancelled.current ? null : parseStepStart(draft, format);
          cancelled.current = false;
          if (n !== null && n !== start) applyStyle({ stepStart: n });
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.stopPropagation();
            cancelled.current = e.key === "Escape";
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/**
 * Gives every marker the style on show. Asks first when the markers are
 * styled differently from each other, since that undoes work.
 */
function ResetStyles({ style }: { style: StepStyle }) {
  const doc = useDoc((s) => s.doc);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuPlacement(confirming, menuRef, () => boxOf(buttonRef.current));
  const effect = stepResetEffect(doc, style);
  const reset = () => resetStepStyles(style);
  usePopover(
    confirming,
    rootRef,
    (keep) => {
      setConfirming(false);
      if (keep) reset();
    },
    "cancel",
  );
  const count = stepsOf(doc).length;
  return (
    <div ref={rootRef} className={styles.dropdownRoot}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.toggle} ${styles.labelled}`}
        {...hint("step.resetStyles")}
        disabled={effect === "none"}
        aria-expanded={confirming}
        onClick={() => (effect === "mixed" ? setConfirming((c) => !c) : reset())}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 12a8 8 0 1 0 2.3-5.7" />
          <path d="M4 4v4h4" />
        </svg>
        <span>Reset styles</span>
      </button>
      {confirming && (
        <div ref={menuRef} className={`${styles.menu} ${styles.confirm}`} role="alertdialog">
          <p>
            Your markers have different styles. Give all {count} of them this style? You can undo it
            with Ctrl+Z.
          </p>
          <div className={styles.colorActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.accentButton}
              onClick={() => {
                setConfirming(false);
                reset();
              }}
            >
              Reset styles
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
