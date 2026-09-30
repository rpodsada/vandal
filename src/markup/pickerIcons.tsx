// The icons that say what a number picker sets. They lead a picker shown as a
// dropdown or slider, which on its own doesn't say (Richard's rule); buttons
// show their values instead. Corner radius and darkness always have theirs.

import styles from "./options.module.css";

/** Text size: a small and a large A. */
export const TEXT_SIZE_ICON = (
  <svg className={styles.pickerIcon} viewBox="0 0 16 16" aria-hidden>
    <path d="M1 13l2.5-6 2.5 6M1.9 11h3.2" />
    <path d="M7.5 13l3.5-10 3.5 10M8.8 9.7h4.4" />
  </svg>
);

/** Line width: lines getting thicker. */
export const LINE_WIDTH_ICON = (
  <svg className={styles.pickerIcon} viewBox="0 0 16 16" aria-hidden>
    <path d="M2 3.5h12" strokeWidth="1" />
    <path d="M2 7.5h12" strokeWidth="2" />
    <path d="M2 12.5h12" strokeWidth="3" />
  </svg>
);

/**
 * Corner radius: a rounded corner with an arrow pushing it in from outside
 * (Richard's idea), so it doesn't read as another shape button.
 */
export const CORNER_ICON = (
  <svg className={`${styles.pickerIcon} ${styles.cornerIcon}`} viewBox="0 0 16 16" aria-hidden>
    <path d="M5 15.5a10.5 10.5 0 0 1 10.5-10.5" />
    <path d="M1.5 1.5l5.3 5.3M6.8 3.3v3.5H3.3" />
  </svg>
);

/** Spotlight's darkness: half light, half dark. */
export const DARKNESS_ICON = (
  <svg className={styles.pickerIcon} viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" className={styles.solid} />
  </svg>
);

/** Step marker size: a small and a large marker. */
export const MARKER_SIZE_ICON = (
  <svg className={styles.pickerIcon} viewBox="0 0 16 16" aria-hidden>
    <circle cx="4" cy="11" r="2.5" />
    <circle cx="11" cy="7" r="4.5" />
  </svg>
);

/** Pixelate's block size: a square of blocks. */
export const BLOCK_SIZE_ICON = (
  <svg className={styles.pickerIcon} viewBox="0 0 16 16" aria-hidden>
    <path d="M2.5 2.5h5.5v5.5H2.5zM8 8h5.5v5.5H8z" className={styles.solid} />
    <rect x="2.5" y="2.5" width="11" height="11" />
  </svg>
);

/** Blur's radius: a solid core fading out. */
export const BLUR_RADIUS_ICON = (
  <svg className={styles.pickerIcon} viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="2.5" className={styles.solid} />
    <circle cx="8" cy="8" r="6" strokeDasharray="2 2" />
  </svg>
);
