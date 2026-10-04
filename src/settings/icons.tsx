// 16px line icons for the settings sidebar. Stroke uses currentColor.
const props = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function GeneralIcon() {
  return (
    <svg {...props}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
      <circle cx="5.5" cy="4.5" r="1.4" fill="var(--bg-nav)" />
      <circle cx="10.5" cy="8" r="1.4" fill="var(--bg-nav)" />
      <circle cx="7" cy="11.5" r="1.4" fill="var(--bg-nav)" />
    </svg>
  );
}

export function CaptureIcon() {
  return (
    <svg {...props}>
      <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SaveIcon() {
  return (
    <svg {...props}>
      <path d="M8 2.5v7M5 6.8 8 9.8l3-3" />
      <path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

export function MarkupIcon() {
  return (
    <svg {...props}>
      <path d="M3 13l2.6-.6 7-7-2-2-7 7z" />
      <path d="M9.6 4.4l2 2" />
    </svg>
  );
}

export function KeyboardIcon() {
  return (
    <svg {...props}>
      <rect x="1.8" y="4" width="12.4" height="8" rx="1.5" />
      <path d="M4.5 6.6h.01M6.8 6.6h.01M9.2 6.6h.01M11.5 6.6h.01M5.5 9.4h5" />
    </svg>
  );
}

export function AboutIcon() {
  return (
    <svg {...props}>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 7.2v3.6" />
      <circle cx="8" cy="5.1" r="0.5" fill="currentColor" />
    </svg>
  );
}

/** Circling arrow: updates (PLAN 3P.4). */
export function UpdatesIcon() {
  return (
    <svg {...props}>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M12.2 1.6v2.8H9.4" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...props}>
      <circle cx="7" cy="7" r="4.3" />
      <path d="m10.3 10.3 3.2 3.2" />
    </svg>
  );
}

/**
 * Small icons for buttons inside controls (add, remove). Drawn rather than
 * typed, so they sit in the middle of their buttons: the "+" and "×"
 * characters don't, in most fonts.
 */
export function PlusIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...props} width={size} height={size} viewBox="0 0 12 12" strokeWidth={1.4}>
      <path d="M6 1.5v9M1.5 6h9" />
    </svg>
  );
}

export function RemoveIcon({ size = 8 }: { size?: number }) {
  return (
    <svg {...props} width={size} height={size} viewBox="0 0 8 8" strokeWidth={1.3}>
      <path d="M1 1l6 6M7 1l-6 6" />
    </svg>
  );
}
