import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { FontPicker } from "../shared/ipc";
import { Dropdown } from "./Dropdown";
import { slotIndex, slotKey } from "./pickers";
import { KEEPS_TEXT_EDITING, refocusTextEditor } from "./TextEditor";
import styles from "./options.module.css";

interface Props {
  picker: FontPicker;
  /** The fonts on offer (the custom list, or every installed font). */
  fonts: string[];
  value: string;
  /** Show slot-number badges (Alt is held). */
  showKeys: boolean;
  hints: boolean;
  onPick: (family: string) => void;
}

const TRACK_WIDTH = 130;

/** The font picker (mockup: Pickers → Font): a filterable dropdown, or a stepped slider. */
export function FontPickerControl(props: Props) {
  const pick = (family: string) => {
    props.onPick(family);
    refocusTextEditor();
  };
  if (props.picker.control === "stepped" && props.fonts.length <= 10) {
    return <FontSlider {...props} onPick={pick} />;
  }
  return <FontDropdown {...props} onPick={pick} />;
}

function FontDropdown({ fonts, value, hints, onPick }: Props) {
  return (
    <Dropdown
      className={`${styles.dropdown} ${styles.fontButton}`}
      menuClassName={styles.fontMenu}
      title={`Font${hints ? " (Alt+1…0)" : ""}`}
      onClose={refocusTextEditor}
      button={
        <span className={styles.fontName} style={{ fontFamily: `"${value}"` }}>
          {value}
        </span>
      }
    >
      {(close) => (
        <FontList
          fonts={fonts}
          value={value}
          hints={hints}
          onPick={(f) => {
            onPick(f);
            close();
          }}
        />
      )}
    </Dropdown>
  );
}

/** The open font menu: a filter field over every font, each shown in its own face. */
function FontList({
  fonts,
  value,
  hints,
  onPick,
}: {
  fonts: string[];
  value: string;
  hints: boolean;
  onPick: (family: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const shown = filter
    ? fonts.filter((f) => f.toLowerCase().includes(filter.trim().toLowerCase()))
    : fonts;
  // The Alt+digit shortcut (spelled out: size digits need no modifier) for the fonts it picks: every font of a short list, or
  // each tenth of a long one. Positions change while filtering, so none then.
  const keys = new Map<string, string>();
  if (hints && !filter) {
    for (let n = 1; n <= 10; n++) {
      const i = slotIndex(fonts.length, n);
      if (i !== null) keys.set(fonts[i], `Alt+${slotKey(n - 1)}`);
    }
  }

  // Each row switches to its own face once scrolled into view: showing
  // hundreds of faces at once makes the webview load every font file first.
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const fresh = entries
          .filter((e) => e.isIntersecting)
          .map((e) => (e.target as HTMLElement).dataset.font!);
        if (fresh.length) setSeen((s) => new Set([...s, ...fresh]));
      },
      { root: list, rootMargin: "200px 0px" },
    );
    list.querySelectorAll("[data-font]").forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [shown.length, filter]);

  // Open at the current font.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <>
      <div className={styles.filterWrap}>
        <label className={styles.filter}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input
            type="text"
            // Typing here doesn't end the text being edited.
            {...{ [KEEPS_TEXT_EDITING]: "" }}
            autoFocus
            placeholder="Type to filter…"
            aria-label="Filter fonts"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown.length) {
                e.preventDefault();
                onPick(shown[0]);
              }
            }}
          />
        </label>
      </div>
      <div ref={listRef} className={styles.fontList}>
        {shown.map((f) => (
          <button
            key={f}
            type="button"
            role="menuitemradio"
            aria-checked={f === value}
            className={styles.menuRow}
            data-font={f}
            onClick={() => onPick(f)}
          >
            <span
              className={styles.fontFace}
              style={seen.has(f) ? { fontFamily: `"${f}"` } : undefined}
            >
              {f}
            </span>
            {keys.has(f) && <span className={styles.menuKey}>{keys.get(f)}</span>}
          </button>
        ))}
        {!shown.length && <div className={styles.menuEmpty}>No fonts match</div>}
      </div>
    </>
  );
}

/** A custom list of up to 10 fonts as a stepped slider, with the name under it in that font. */
function FontSlider({ fonts, value, showKeys, hints, onPick }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const n = fonts.length;
  const i = Math.max(0, fonts.indexOf(value));
  const x = (k: number) => (n > 1 ? (k / (n - 1)) * TRACK_WIDTH : 0);

  const fontAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return fonts[Math.round(f * (n - 1))];
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let last = fontAt(e.clientX);
    onPick(last);
    const move = (m: PointerEvent) => {
      const f = fontAt(m.clientX);
      if (f !== last) onPick((last = f));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  return (
    <div className={styles.fontSlider}>
      <div
        ref={trackRef}
        className={styles.track}
        style={{ width: TRACK_WIDTH }}
        role="slider"
        aria-label="Font"
        aria-valuetext={value}
        title={`Font${hints ? " (Alt+1…0)" : ""}`}
        onPointerDown={onPointerDown}
      >
        <span className={styles.trackBg} />
        <span className={styles.trackFill} style={{ width: x(i) }} />
        {fonts.map((f, k) => (
          <span key={f}>
            <span className={styles.stop} data-passed={k <= i} style={{ left: x(k) - 2 }} />
            {showKeys && (
              <span className={styles.stopKey} style={{ left: x(k) - 7 }}>
                {slotKey(k)}
              </span>
            )}
          </span>
        ))}
        <span className={styles.thumb} style={{ left: x(i) - 9 }}>
          <span className={styles.thumbDot} />
        </span>
      </div>
      <span className={styles.fontSliderName} style={{ fontFamily: `"${value}"` }}>
        {value}
      </span>
    </div>
  );
}
