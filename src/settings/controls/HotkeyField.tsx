import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { commands } from "../../shared/ipc";
import { combo, isModifier, keyName, modsLabel, modsOf } from "../hotkeyNames";
import { getIn } from "../path";
import type { HotkeyItem } from "../schema";
import { useSetting, useSettingsStore } from "../store";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

/** Which shortcut is being recorded: one at a time (these and the markup's). */
export const useRecording = create<{ path: string | null }>(() => ({ path: null }));

/** The shortcuts, by settings key, as the conflict message names them. */
const ACTIONS: Record<string, string> = {
  region: "Capture a region",
  fullscreen: "Capture the full screen",
};

/**
 * A global shortcut (PLAN 3B): shown as keys; Change records a new one from
 * the keys pressed in this window (as VS Code, OBS and ShareX do), with our
 * own shortcuts paused meanwhile. Clear removes it, Reset brings back the
 * default. Win combinations that Windows keeps for itself (Win+E...) never
 * reach the window, but those can't be global shortcuts anyway.
 */
export function HotkeyField({ item, id, disabled }: ControlProps<HotkeyItem>) {
  const [value, setValue] = useSetting(item.path);
  const hotkeys = useSettingsStore((s) => s.settings!.hotkeys);
  const recordingPath = useRecording((s) => s.path);
  const recording = recordingPath === item.path;
  const [held, setHeld] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [initial, setInitial] = useState<string | null | undefined>(undefined);
  // Windows 11 keeps PrintScreen for its own screen capture unless turned off.
  const [snipping, setSnipping] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Read when a combination completes, without restarting the recording.
  const latest = useRef({ hotkeys, value, setValue });
  useEffect(() => {
    latest.current = { hotkeys, value, setValue };
  });

  useEffect(() => {
    void commands.defaultSettings().then((d) => setInitial(getIn(d, item.path) ?? null));
  }, [item.path]);

  useEffect(() => {
    if (!recording) return;
    const key = item.path.split(".").pop()!;
    void commands.hotkeysPause();
    void commands.printScreenOpensSnipping().then(setSnipping);
    boxRef.current?.focus();
    // The modifiers held now, for when Windows takes the rest of the shortcut.
    let heldNow = "";
    const hold = (label: string) => {
      heldNow = label;
      setHeld(label);
    };

    const finish = (result: { combo: string } | { error: string } | null) => {
      hold("");
      useRecording.setState({ path: null });
      if (!result) return;
      if ("error" in result) return setError(result.error);
      const { hotkeys, value } = latest.current;
      const clash = Object.entries(hotkeys).find(
        ([k, v]) => k !== key && k in ACTIONS && v?.toLowerCase() === result.combo.toLowerCase(),
      );
      if (clash) return setError(`${result.combo} already does "${ACTIONS[clash[0]]}".`);
      setError(null);
      if (result.combo === value) return;
      // Another app (or Windows) may hold it: then keep the old one.
      void commands.hotkeyCheck(result.combo).then((problem) => {
        if (problem) setError(problem);
        else latest.current.setValue(result.combo);
      });
    };

    // Every key goes to the recorder while it listens: nothing else reacts.
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (isModifier(e.code)) return hold(modsLabel(modsOf(e)));
      const mods = modsOf(e);
      if (e.code === "Escape" && !modsLabel(mods)) return finish(null);
      const name = keyName(e.code);
      // Keys a shortcut can't use: keep listening.
      if (name) finish(combo(mods, name));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Windows only sends PrintScreen's release to windows.
      if (e.code === "PrintScreen") return finish(combo(modsOf(e), "PrintScreen"));
      if (isModifier(e.code)) hold(modsLabel(modsOf(e)));
    };
    // Leaving the window ends it: the keys are the user's again. With
    // modifiers held, Windows or another app most likely acted on the keys
    // (Win+E opens Explorer) and took the focus.
    const onBlur = () => {
      const took = heldNow;
      finish(null);
      if (took) {
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
      void commands.hotkeysResume();
    };
  }, [recording, item.path]);

  const keys = recording ? (held ? held.split("+") : []) : (value?.split("+") ?? []);
  return (
    <div className={styles.stack}>
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
            <span className={styles.hotkeyPrompt}>{held ? "+ …" : "Press a shortcut…"}</span>
          ) : (
            !value && <span className={styles.hotkeyPrompt}>Not set</span>
          )}
        </div>
        <button
          type="button"
          className={styles.button}
          disabled={disabled || (recordingPath !== null && !recording)}
          onClick={() => {
            setError(null);
            useRecording.setState({ path: recording ? null : item.path });
          }}
        >
          {recording ? "Cancel" : "Change"}
        </button>
        {!recording && value && (
          <button
            type="button"
            className={styles.button}
            disabled={disabled || recordingPath !== null}
            onClick={() => {
              setError(null);
              setValue(null);
            }}
          >
            Clear
          </button>
        )}
        {!recording && initial !== undefined && value !== initial && (
          <button
            type="button"
            className={styles.button}
            disabled={disabled || recordingPath !== null}
            title={initial ? `Back to ${initial}` : undefined}
            onClick={() => {
              setError(null);
              setValue(initial);
            }}
          >
            Reset
          </button>
        )}
      </div>
      {recording && (
        <p className={styles.help}>
          Hold Ctrl, Alt, Shift or Win and press a key. F-keys, PrintScreen and Pause also work on
          their own. Esc cancels.
        </p>
      )}
      {error && <p className={styles.fieldError}>{error}</p>}
      {(recording || error?.includes("PrintScreen")) && snipping && (
        <p className={styles.help}>
          PrintScreen opens Windows&rsquo; own screen capture right now. To use it here, turn off
          &ldquo;Use the Print screen key to open screen capture&rdquo;.{" "}
          <button
            type="button"
            className={styles.button}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void commands.openKeyboardSettings()}
          >
            Open Windows settings
          </button>
        </p>
      )}
    </div>
  );
}
