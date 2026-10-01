import logo from "../../../assets/vandal-icon-tray.png";
import pkg from "../../../package.json";
import { commands } from "../../shared/ipc";
import type { AboutItem } from "../schema";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

/** Settings › About: the logo, name and version, what Vandal is, who made it, and where it lives. */
export function AboutCard({ id }: ControlProps<AboutItem>) {
  return (
    <div id={id} className={styles.about}>
      <img className={styles.aboutLogo} src={logo} alt="" />
      <div className={styles.aboutText}>
        <p className={styles.aboutName}>
          Vandal <span className={styles.aboutVersion}>{pkg.version}</span>
        </p>
        {/* The README's tagline. */}
        <p className={styles.aboutDescription}>The screenshot tool that gets out of your way.</p>
        <p className={styles.aboutMeta}>
          Created by {pkg.author}
          <br />
          Copyright © 2026 {pkg.author}
          <br />
          Free software under the GNU GPL v3.0 or later.
        </p>
        <button
          type="button"
          className={styles.aboutLink}
          onClick={() => void commands.openProjectPage()}
        >
          github.com/rpodsada/vandal
        </button>
      </div>
    </div>
  );
}
