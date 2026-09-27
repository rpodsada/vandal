// Which shortcut badges to show on the pickers: slot numbers appear while a
// digit key is held (width/size), or Ctrl or Alt is held on its own for a
// moment (color / font), so Ctrl+Z and friends don't flash them.

import { useEffect, useState } from "react";
import { isTyping } from "../shared/dom";
import { digitSlot } from "./pickers";

export interface HeldKeys {
  digit: boolean;
  ctrl: boolean;
  alt: boolean;
}

const NONE: HeldKeys = { digit: false, ctrl: false, alt: false };
/** How long Ctrl or Alt must be held alone before its badges show. */
const HOLD_MS = 350;

export function useHeldKeys(): HeldKeys {
  const [held, setHeld] = useState(NONE);

  useEffect(() => {
    let timer: number | undefined;
    const digits = new Set<string>();
    const set = (patch: Partial<HeldKeys>) => setHeld((h) => ({ ...h, ...patch }));

    const down = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Alt") {
        if (e.repeat) return;
        const key = e.key === "Control" ? "ctrl" : "alt";
        window.clearTimeout(timer);
        timer = window.setTimeout(() => set({ [key]: true }), HOLD_MS);
        return;
      }
      if (digitSlot(e.code)) {
        // Modifier+digit keeps that modifier's badges up while picking.
        if (!e.ctrlKey && !e.altKey && !isTyping(e.target)) {
          digits.add(e.code);
          set({ digit: true });
        }
        return;
      }
      // Any other key: this was a shortcut, not a look at the badges.
      window.clearTimeout(timer);
      set({ ctrl: false, alt: false });
    };

    const up = (e: KeyboardEvent) => {
      if (digits.delete(e.code) && !digits.size) set({ digit: false });
      if (e.key === "Control" || e.key === "Alt") {
        window.clearTimeout(timer);
        set(e.key === "Control" ? { ctrl: false } : { alt: false });
      }
    };

    const reset = () => {
      window.clearTimeout(timer);
      digits.clear();
      setHeld(NONE);
    };

    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", reset);
    };
  }, []);

  return held;
}
