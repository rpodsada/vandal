import { useRef, useState } from "react";
import { hexToHsv, hexToRgb, hsvToHex, parseHex, rgbToHex, type Hsv } from "./color";
import styles from "./options.module.css";

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
      <Area
        className={styles.hueBar}
        label="Hue"
        x={hsv.h / 360}
        onMove={(x) => set({ ...hsv, h: Math.min(x * 360, 359.9) })}
        thumbStyle={{ background: hue }}
      />
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
