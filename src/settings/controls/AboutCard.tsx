import logo from "../../../assets/vandal-icon-tray.png";
import pkg from "../../../package.json";
import { commands } from "../../shared/ipc";
import type { AboutItem } from "../schema";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

/**
 * The version, with the build number and commit for `npm run build:local` builds:
 * "0.3.0-beta.3+5 (2cf53f9, modified)". Release builds show package.json's.
 */
function versionLabel(): string {
  const { VITE_BUILD_VERSION, VITE_BUILD_COMMIT, VITE_BUILD_MODIFIED } = import.meta.env;
  const version = VITE_BUILD_VERSION || pkg.version;
  const details = [VITE_BUILD_COMMIT, VITE_BUILD_MODIFIED && "modified"].filter(Boolean);
  return details.length ? `${version} (${details.join(", ")})` : version;
}

/** Settings › About: the logo, name and version, what Vandal is, who made it, where it lives, and where to report bugs. */
export function AboutCard({ id }: ControlProps<AboutItem>) {
  return (
    <div id={id} className={styles.about}>
      <img className={styles.aboutLogo} src={logo} alt="" />
      <div className={styles.aboutText}>
        <p className={styles.aboutName}>
          Vandal <span className={styles.aboutVersion}>{versionLabel()}</span>
        </p>
        {/* The tagline, as in the GitHub repo's About description. */}
        <p className={styles.aboutDescription}>
          The screenshot & markup tool that unlocks your productivity.
        </p>
        <p className={styles.aboutMeta}>
          Created by {pkg.author}
          <br />
          Copyright © 2026 {pkg.author}
          <br />
          Free software under the GNU GPL v3.0 or later.
        </p>
        <div className={styles.aboutLinks}>
          <button
            type="button"
            className={styles.aboutLink}
            onClick={() => void commands.openWebsite()}
          >
            vandalscreenshot.com
          </button>
          <button
            type="button"
            className={styles.aboutLink}
            onClick={() => void commands.openQuickStart()}
          >
            Quick start guide
          </button>
          <button
            type="button"
            className={styles.aboutLink}
            onClick={() => void commands.openProjectPage()}
          >
            github.com/rpodsada/vandal
          </button>
          <button
            type="button"
            className={styles.aboutLink}
            onClick={() => void commands.openIssues()}
          >
            Report a bug or suggest an idea
          </button>
        </div>
      </div>
    </div>
  );
}
