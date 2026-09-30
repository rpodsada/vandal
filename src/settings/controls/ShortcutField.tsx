import { useEffect, useRef, useState } from "react";
import { SHORTCUT_NAMES, comboOf, type ShortcutId } from "../../markup/shortcuts";
import { commands } from "../../shared/ipc";
import { isModifier, modsLabel, modsOf } from "../hotkeyNames";
import type { ShortcutItem } from "../schema";
import { useSettingsStore } from "../store";
import { ConfirmDialog } from "./ConfirmDialog";
import { useRecording } from "./HotkeyField";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

// Windows usually takes Win+letter first (Win+E opens Explorer), so the
// window may only see it leave.
const WIN = "Win is kept for shortcuts that work anywhere in Windows.";

/** A shortcut another action has, waiting for the user to say it can move. */
interface Taken {
  combo: string;
  from: ShortcutId;
}

/**
 * A markup shortcut (PLAN 3F): shown as keys; Change records a letter, alone
 * or with Ctrl, Alt and Shift, like the capture shortcuts (3B) but only for
 * Vandal's own windows. Rust checks it (`shortcut_check`: not a fixed
 * shortcut, not held by Windows or another app). One another action has is
 * moved only after asking, and that action is left without one.
 */
export function ShortcutField({ item, id, disabled }: ControlProps<ShortcutItem>) {
  const shortcuts = useSettingsStore((s) => s.settings!.shortcuts);
  const value = shortcuts[item.shortcut];
  const path = `shortcuts.${item.shortcut}` as const;
  const recordingPath = useRecording((s) => s.path);
  const recording = recordingPath === path;
  const [held, setHeld] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<Taken | null>(null);
  const [initial, setInitial] = useState<string | null | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);
  // Read when a key completes, without restarting the recording.
  const latest = useRef(shortcuts);
  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    void commands.defaultSettings().then((d) => setInitial(d.shortcuts?.[item.shortcut] ?? null));
  }, [item.shortcut]);

  // Clearing the other first keeps every step valid (no shortcut twice).
  const set = async (combo: string | null, clear?: ShortcutId) => {
    const { set: save } = useSettingsStore.getState();
    if (clear) await save(`shortcuts.${clear}`, null);
    await save(path, combo);
  };

  useEffect(() => {
    if (!recording) return;
    boxRef.current?.focus();
    let heldNow = "";
    const hold = (label: string) => {
      heldNow = label;
      setHeld(label);
    };

    const finish = (result: string | { error: string } | null) => {
      hold("");
      useRecording.setState({ path: null });
      if (result === null) return;
      if (typeof result !== "string") return setError(result.error);
      void commands.shortcutCheck(result).then((checked) => {
        if (checked.status === "error") return setError(checked.error);
        const combo = checked.data;
        const shortcuts = latest.current;
        if (shortcuts[item.shortcut] === combo) return;
        const from = (Object.keys(shortcuts) as ShortcutId[]).find(
          (k) => k !== item.shortcut && shortcuts[k] === combo,
        );
        if (from) setTaken({ combo, from });
        else void set(combo);
      });
    };

    // Every key goes to the recorder while it listens: nothing else reacts.
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      const mods = modsOf(e);
      if (isModifier(e.code)) return hold(modsLabel(mods));
      if (e.code === "Escape" && !modsLabel(mods)) return finish(null);
      if (mods.win) return finish({ error: WIN });
      if (/^(Digit|Numpad)\d$/.test(e.code))
        return finish({ error: "Number keys pick sizes, colors and fonts." });
      const combo = comboOf(e);
      finish(combo ?? { error: "Use a letter, alone or with Ctrl, Alt or Shift." });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isModifier(e.code)) hold(modsLabel(modsOf(e)));
    };
    // Leaving the window ends it. With modifiers held, Windows or another app
    // most likely acted on the keys and took the focus.
    const onBlur = () => {
      const took = heldNow;
      finish(null);
      if (took.includes("Win")) setError(WIN);
      else if (took) {
        setError(
          `Windows or another app already uses that ${took}+… shortcut and took the keys. Pick another one.`,
        );
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
    // `set` only reads `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, item.shortcut]);

  const busy = disabled || (recordingPath !== null && !recording) || taken !== null;
  const keys = recording ? (held ? held.split("+") : []) : (value?.split("+") ?? []);
  return (
    <div className={`${styles.stack} ${styles.shortcutField}`}>
      <div className={styles.hotkeyRow}>
        <div
          id={id}
          ref={boxRef}
          tabIndex={-1}
          className={styles.hotkeyBox}
          data-recording={recording || undefined}
          aria-live="polite"
        >
          {keys.map((k, i) => (
            <kbd key={i} className={styles.keycap}>
              {k}
            </kbd>
          ))}
          {recording ? (
            <span className={styles.hotkeyPrompt}>{held ? "+ …" : "Press a key…"}</span>
          ) : (
            !value && <span className={styles.hotkeyPrompt}>Not set</span>
          )}
        </div>
        <button
          type="button"
          className={styles.button}
          disabled={busy && !recording}
          onClick={() => {
            setError(null);
            useRecording.setState({ path: recording ? null : path });
          }}
        >
          {recording ? "Cancel" : "Change"}
        </button>
        {!recording && value && (
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => {
              setError(null);
              void set(null);
            }}
          >
            Clear
          </button>
        )}
        {!recording && initial !== undefined && value !== initial && (
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            title={initial ? `Back to ${initial}` : undefined}
            onClick={() => {
              setError(null);
              const from = (Object.keys(shortcuts) as ShortcutId[]).find(
                (k) => k !== item.shortcut && initial && shortcuts[k] === initial,
              );
              if (from && initial) setTaken({ combo: initial, from });
              else void set(initial);
            }}
          >
            Reset
          </button>
        )}
      </div>
      {recording && (
        <p className={styles.help}>
          Press a letter, alone or with Ctrl, Alt or Shift. Esc cancels.
        </p>
      )}
      {taken && (
        <ConfirmDialog
          title={`Use ${taken.combo} for ${SHORTCUT_NAMES[item.shortcut]}?`}
          confirm="Use it"
          onConfirm={() => {
            void set(taken.combo, taken.from);
            setTaken(null);
          }}
          onCancel={() => setTaken(null)}
        >
          <p>
            {taken.combo} is the shortcut for {SHORTCUT_NAMES[taken.from]}. Using it here leaves{" "}
            {SHORTCUT_NAMES[taken.from]} without a shortcut.
          </p>
        </ConfirmDialog>
      )}
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}
