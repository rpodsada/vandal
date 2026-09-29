import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { blockBrowserUi } from "../shared/browserUi";
import { startAppearanceSync } from "../shared/appearance";
import "./overlay.css";
import { OverlayApp } from "./OverlayApp";

blockBrowserUi();
startAppearanceSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
