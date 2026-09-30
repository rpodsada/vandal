import { useRef, useState, type ReactNode } from "react";
import { hint } from "./HintLine";
import type { ControlHint } from "./hints";
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
import { resetStepNumbering } from "./stepEditing";
import {
  customLabelCount,
  parseStepStart,
  stepLabel,
  stepResetEffect,
  stepsOf,
  type StepStyle,
} from "./steps";
import { stepFontChoices, stepFontPicker, useStyleConfig } from "./styles";
import { FontPickerControl } from "./FontPickerControl";
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
  /** Digit badges on the size picker (a digit is held). */
  showKeys: boolean;
  /** Slot badges on the font picker (Alt is held). */
  showFontKeys: boolean;
}

/** The step marker's options (PLAN 3D.11): font, shape, size, labels, and the resets. */
export function StepOptions({ step, hints, showKeys, showFontKeys }: Props) {
  const config = useStyleConfig();
  return (
    <>
      <div className={styles.section}>
        <span className={styles.hintArea} {...hint("font")}>
          <FontPickerControl
            picker={stepFontPicker(config)}
            fonts={stepFontChoices(config)}
            value={step.fontFamily}
            showKeys={showFontKeys}
            hints={hints}
            onPick={(fontFamily) => applyStyle({ fontFamily })}
          />
        </span>
        <span className={styles.hintArea} {...hint("size")}>
          <NumberPickerControl
            picker={config.styles.stepSize}
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
        <div className={styles.group}>
          <ResetStyles style={step} />
          <ResetNumbering />
        </div>
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
  const effect = stepResetEffect(doc, style);
  return (
    <ConfirmButton
      label="Sync style"
      hintId="step.resetStyles"
      disabled={effect === "none"}
      question={
        effect === "mixed"
          ? `Your markers have different styles. Give all ${stepsOf(doc).length} of them this style?`
          : null
      }
      onConfirm={() => resetStepStyles(style)}
    />
  );
}

/** Drops every typed label so all markers count up again; always asks first. */
function ResetNumbering() {
  const count = useDoc((s) => customLabelCount(s.doc));
  return (
    <ConfirmButton
      label="Renumber"
      hintId="step.resetNumbering"
      disabled={count === 0}
      question={
        count === 1
          ? "Replace the label you typed with automatic numbering?"
          : `Replace the ${count} labels you typed with automatic numbering?`
      }
      onConfirm={resetStepNumbering}
    />
  );
}

/**
 * A button that asks `question` in a popover before doing `onConfirm`
 * (Enter confirms, Esc cancels), or does it at once when `question` is null.
 */
function ConfirmButton({
  label,
  hintId,
  disabled,
  question,
  onConfirm,
}: {
  label: string;
  hintId: ControlHint;
  disabled: boolean;
  question: string | null;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuPlacement(confirming, menuRef, () => boxOf(buttonRef.current));
  usePopover(
    confirming,
    rootRef,
    (keep) => {
      setConfirming(false);
      if (keep) onConfirm();
    },
    "cancel",
  );
  return (
    <div ref={rootRef} className={styles.dropdownRoot}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.toggle} ${styles.labelled}`}
        {...hint(hintId)}
        disabled={disabled}
        aria-expanded={confirming}
        onClick={() => (question ? setConfirming((c) => !c) : onConfirm())}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 12a8 8 0 1 0 2.3-5.7" />
          <path d="M4 4v4h4" />
        </svg>
        <span>{label}</span>
      </button>
      {confirming && (
        <div ref={menuRef} className={`${styles.menu} ${styles.confirm}`} role="alertdialog">
          <p>{question} You can undo it with Ctrl+Z.</p>
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
                onConfirm();
              }}
            >
              {label}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
