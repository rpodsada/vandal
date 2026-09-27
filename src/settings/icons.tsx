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

export function EditorIcon() {
  return (
    <svg {...props}>
      <path d="M3 13l2.6-.6 7-7-2-2-7 7z" />
      <path d="M9.6 4.4l2 2" />
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

export function SearchIcon() {
  return (
    <svg {...props}>
      <circle cx="7" cy="7" r="4.3" />
      <path d="m10.3 10.3 3.2 3.2" />
    </svg>
  );
}
