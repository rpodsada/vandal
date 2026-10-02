import { hint } from "./HintLine";
import { findText, useTextRedact } from "./textRedact";
import { useToolStore } from "./toolStore";
import styles from "./options.module.css";

/**
 * Redact's Detect text toggle (PLAN 3J): select detected words instead of drawing a
 * box. Turning it on recognizes the image's text the first time; what was
 * found (or why not) shows beside it.
 */
export function TextRedactToggle() {
  const on = useToolStore((s) => s.redactText);
  const status = useTextRedact((s) => s.status);
  const toggle = () => {
    useToolStore.setState({ redactText: !on });
    if (!on) void findText();
  };
  return (
    <>
      <button
        type="button"
        className={`${styles.toggle} ${styles.labelled}`}
        aria-pressed={on}
        title="Detect text: find the words in the image and select them to redact, instead of drawing a box"
        onClick={toggle}
        {...hint("redact.text")}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          {/* Off: a letter with the text cursor at it. On: the letter gives way
              to a redaction bar growing out behind the cursor. */}
          <path
            className={styles.textGlyph}
            fillRule="evenodd"
            d="M3 20 8.3 4h3.4L17 20h-3.2l-1.2-3.6H7.4L6.2 20ZM8.3 13.6h3.4L10 8.3Z"
          />
          <rect className={styles.textBar} x="3" y="9" height="6" rx="1" />
          <path d="M14 5h5M14 19h5M16.5 5v14" />
        </svg>
        <span>Detect text</span>
      </button>
      {on && <TextStatus status={status} />}
    </>
  );
}

function TextStatus({ status }: { status: ReturnType<typeof useTextRedact.getState>["status"] }) {
  switch (status.kind) {
    case "idle":
      return null;
    case "finding":
      return (
        <span className={styles.textStatus} role="status">
          <span className={styles.spinner} aria-hidden />
          Finding text…
        </span>
      );
    case "ready": {
      const n = status.layout.words.length;
      return (
        <span className={styles.textStatus} role="status">
          {n ? `${n} ${n === 1 ? "word" : "words"} found` : "No text found: drag to draw a box"}
        </span>
      );
    }
    case "error":
      return status.error.kind === "noLanguage" ? (
        <span
          className={`${styles.textStatus} ${styles.textProblem}`}
          role="status"
          title="Add a language with text recognition in Windows Settings › Time & language › Language & region, then turn Text on again."
        >
          Needs a Windows OCR language
        </span>
      ) : (
        <span
          className={`${styles.textStatus} ${styles.textProblem}`}
          role="status"
          title={status.error.message}
        >
          Couldn't read the text
        </span>
      );
  }
}
