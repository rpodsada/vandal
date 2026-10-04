import { useEffect, useState } from "react";
import { commands, events, type UpdateInfo } from "../../shared/ipc";
import type { UpdatesItem } from "../schema";
import { useSettingsStore } from "../store";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "downloading"; info: UpdateInfo; percent: number | null }
  | { kind: "installing"; info: UpdateInfo };

/**
 * Settings › Updates (PLAN 3P.4): what the last check found, Check now,
 * and Install and restart, with the download's progress. Rust does the work;
 * an install that returns at all was stopped, and says why.
 */
export function UpdatesCard({ id }: ControlProps<UpdatesItem>) {
  const automatic = useSettingsStore((s) => s.settings!.updates.checkAutomatically);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void commands.updateAvailable().then((info) => {
      if (info) setStatus((s) => (s.kind === "idle" ? { kind: "available", info } : s));
    });
    const subscriptions = [
      events.updateAvailable.listen(({ payload }) => {
        setStatus((s) =>
          s.kind === "idle" || s.kind === "latest" ? { kind: "available", info: payload } : s,
        );
      }),
      events.updateProgress.listen(({ payload }) => {
        setStatus((s) => {
          if (s.kind !== "installing" && s.kind !== "downloading") return s;
          const { downloaded, total } = payload;
          const percent = total ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
          return { kind: "downloading", info: s.info, percent };
        });
      }),
    ];
    return () => subscriptions.forEach((u) => void u.then((f) => f()));
  }, []);

  const check = async () => {
    setError(null);
    setStatus({ kind: "checking" });
    const r = await commands.updateCheck();
    if (r.status === "error") {
      setError(r.error);
      setStatus({ kind: "idle" });
    } else {
      setStatus(r.data ? { kind: "available", info: r.data } : { kind: "latest" });
    }
  };

  const install = async (info: UpdateInfo) => {
    setError(null);
    setStatus({ kind: "installing", info });
    // Only returns if something stopped it: on success Vandal exits and restarts.
    const r = await commands.updateInstall();
    if (r.status === "error") setError(r.error);
    setStatus({ kind: "available", info });
  };

  const busy =
    status.kind === "checking" || status.kind === "downloading" || status.kind === "installing";
  const info = "info" in status ? status.info : null;

  return (
    <div id={id} className={styles.updates}>
      <div className={styles.updatesRow}>
        <div className={styles.updatesText}>
          <p>{statusText(status, automatic)}</p>
          {status.kind === "available" && (
            <p className={styles.updatesNote}>You have {status.info.currentVersion}.</p>
          )}
          {status.kind === "downloading" && (
            <progress
              className={styles.updatesProgress}
              max={100}
              value={status.percent ?? undefined}
            />
          )}
          {info && (
            <button
              type="button"
              className={styles.aboutLink}
              onClick={() => void commands.openReleaseNotes(info.version)}
            >
              What's new in {info.version}
            </button>
          )}
        </div>
        <div className={styles.updatesButtons}>
          {info && (
            <button
              type="button"
              className={`${styles.button} ${styles.primaryButton}`}
              disabled={busy}
              onClick={() => void install(info)}
            >
              Install and restart
            </button>
          )}
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => void check()}
          >
            Check now
          </button>
        </div>
      </div>
      {error && (
        <p className={styles.updatesError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function statusText(status: Status, automatic: boolean): string {
  switch (status.kind) {
    case "idle":
      return automatic
        ? "Vandal checks for updates when it starts and once a day."
        : "Automatic update checks are off.";
    case "checking":
      return "Checking for updates…";
    case "latest":
      return "You have the latest version.";
    case "available":
      return `Vandal ${status.info.version} is available.`;
    case "downloading":
      if (status.percent === 100) return `Installing ${status.info.version}…`;
      return status.percent === null
        ? `Downloading ${status.info.version}…`
        : `Downloading ${status.info.version}… ${status.percent}%`;
    case "installing":
      return `Installing ${status.info.version}…`;
  }
}
