import popup from "../../../assets/extension-popup.png";
import { commands } from "../../shared/ipc";
import type { ExtensionItem } from "../schema";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

/** Settings › About › Chrome Extension: what the extension does, and its store page (PLAN 3N.10). */
export function ExtensionCard({ id }: ControlProps<ExtensionItem>) {
  return (
    <div id={id} className={styles.extension}>
      <div className={styles.extensionText}>
        <p>
          <strong>Vandal Screen Capture</strong> is a free Chrome extension that captures web pages
          from inside the browser: the visible area, a region, or the whole page from top to bottom.
          Copy or save the capture right there, or open it in Vandal&rsquo;s editor to mark it up.
        </p>
        <button
          type="button"
          className={`${styles.button} ${styles.primaryButton}`}
          onClick={() => void commands.openExtensionPage()}
        >
          Get it from the Chrome Web Store
        </button>
      </div>
      <img
        className={styles.extensionShot}
        src={popup}
        alt="The extension's popup: After capture, and Visible area, Region and Full page with their shortcuts"
      />
    </div>
  );
}
