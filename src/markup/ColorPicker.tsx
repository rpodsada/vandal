import { useRef, useState } from "react";
import { hexToHsv, hexToRgb, hsvToHex, parseHex, rgbToHex, type Hsv } from "./color";
import { setPickingFromScreen } from "./usePopover";
import styles from "./options.module.css";

// The browser's eyedropper (Chromium, so WebView2): picks any pixel on screen.
interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>;
}
declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperApi;
  }
}
const canPickFromScreen = typeof window !== "undefined" && !!window.EyeDropper;

interface Props {
  /** "#rrggbb". */
  value: string;
  onChange: (hex: string) => void;
}

/**
 * A full color picker (PLAN 2A.6c, mockup "Colors · Custom picker"):
 * saturation/brightness square, hue bar, preview, hex and R/G/B fields.
 * Controlled and host-agnostic, so Settings can reuse it (2C).
 */
export function ColorPicker({ value, onChange }: Props) {
  // Kept as HSV so the hue survives dragging through grey, black or white.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  if (hsvToHex(hsv) !== value && parseHex(value) === value) {
    // Changed from outside (a field, or the host): follow it.
    const next = hexToHsv(value);
    setHsv(next.s && next.v ? next : { ...next, h: hsv.h });
  }

  const set = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    if (hex !== value) onChange(hex);
  };

  const rgb = hexToRgb(value);
  const hue = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className={styles.colorPicker}>
      <Area
        className={styles.svArea}
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hue})`,
        }}
        label="Saturation and brightness"
        x={hsv.s}
        y={1 - hsv.v}
        onMove={(x, y) => set({ ...hsv, s: x, v: 1 - (y ?? 0) })}
        thumbStyle={{ background: value }}
      />
      <div className={styles.hueRow}>
        {canPickFromScreen && <Eyedropper onPick={onChange} />}
        <Area
          className={styles.hueBar}
          label="Hue"
          x={hsv.h / 360}
          onMove={(x) => set({ ...hsv, h: Math.min(x * 360, 359.9) })}
          thumbStyle={{ background: hue }}
        />
      </div>
      <div className={styles.colorFields}>
        <span className={styles.colorPreview} style={{ background: value }} />
        <HexField value={value} onChange={onChange} />
        {(["r", "g", "b"] as const).map((k) => (
          <NumberField
            key={k}
            label={k.toUpperCase()}
            value={rgb[k]}
            onChange={(n) => onChange(rgbToHex({ ...rgb, [k]: n }))}
          />
        ))}
      </div>
    </div>
  );
}

/** A 1D (y undefined) or 2D drag area with a round thumb; arrows nudge it. */
function Area({
  className,
  style,
  label,
  x,
  y,
  onMove,
  thumbStyle,
}: {
  className: string;
  style?: React.CSSProperties;
  label: string;
  x: number;
  y?: number;
  onMove: (x: number, y?: number) => void;
  thumbStyle: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const twoD = y !== undefined;

  const moveTo = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const fx = clamp((e.clientX - r.left) / r.width);
    onMove(fx, twoD ? clamp((e.clientY - r.top) / r.height) : undefined);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys here are for the picker, not the editor's shortcuts.
    if (e.key !== "Tab" && e.key !== "Escape" && e.key !== "Enter") e.stopPropagation();
    const step = e.shiftKey ? 0.1 : 0.01;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = twoD && e.key === "ArrowUp" ? -step : twoD && e.key === "ArrowDown" ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    onMove(clamp(x + dx), twoD ? clamp(y + dy) : undefined);
  };

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="slider"
      aria-label={label}
      aria-valuenow={Math.round(x * 100)}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) moveTo(e);
      }}
      onKeyDown={onKeyDown}
    >
      <span
        className={styles.areaThumb}
        style={{ ...thumbStyle, left: `${x * 100}%`, top: twoD ? `${y * 100}%` : "50%" }}
      />
    </div>
  );
}

/** Hex field: applies as soon as it holds a full color; tidied on blur. */
function HexField({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  // What's being typed; null shows the value.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      className={`${styles.colorField} ${styles.hexField}`}
      aria-label="Hex"
      value={draft ?? value.toUpperCase()}
      spellCheck={false}
      maxLength={7}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        // Also "#abc", and what was typed when Enter closed the picker.
        const hex = draft === null ? null : parseHex(draft);
        if (hex && hex !== value) onChange(hex);
        setDraft(null);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const hex = parseHex(e.target.value);
        // "#abc" is also a color, but mid-typing a six-digit one: wait for six.
        if (hex && e.target.value.replace("#", "").length === 6) onChange(hex);
      }}
    />
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      className={styles.colorField}
      aria-label={label}
      title={label}
      inputMode="numeric"
      value={draft ?? String(value)}
      maxLength={3}
      onFocus={(e) => e.target.select()}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        setDraft(digits);
        if (digits) onChange(Math.min(255, Number(digits)));
      }}
      onKeyDown={(e) => {
        // Up/down step the value, like a spin box.
        const d = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        const n = Math.min(255, Math.max(0, value + d * (e.shiftKey ? 10 : 1)));
        setDraft(null);
        onChange(n);
      }}
    />
  );
}

/** Pick a color from anywhere on screen, the capture included. */
function Eyedropper({ onPick }: { onPick: (hex: string) => void }) {
  const pick = async () => {
    const Api = window.EyeDropper;
    if (!Api) return;
    setPickingFromScreen(true);
    try {
      const { sRGBHex } = await new Api().open();
      const hex = parseHex(sRGBHex);
      if (hex) onPick(hex);
    } catch {
      // Esc: nothing picked.
    } finally {
      // After the click or Esc that ended it has gone past the popover.
      setTimeout(() => setPickingFromScreen(false));
    }
  };
  return (
    <button
      type="button"
      className={styles.eyedropper}
      aria-label="Pick a color from the screen"
      title="Pick a color from the screen"
      onClick={() => void pick()}
    >
      <svg viewBox="0 0 24 24" className={styles.filledIcon} aria-hidden>
        <path d="M20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-3.12 3.12-1.93-1.91-1.41 1.41 1.42 1.42L3 16.25V21h4.75l8.92-8.92 1.42 1.42 1.41-1.41-1.92-1.92 3.12-3.12a1 1 0 0 0 .01-1.42zM6.92 19L5 17.08l8.06-8.06 1.92 1.92z" />
      </svg>
    </button>
  );
}
