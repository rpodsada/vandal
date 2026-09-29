import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { blockBrowserUi } from "../shared/browserUi";
import { startAppearanceSync } from "../shared/appearance";
import "./overlay.css";
import { OverlayApp } from "./OverlayApp";
import { useToolStore } from "../markup/toolStore";

blockBrowserUi();
startAppearanceSync();
// Redact comes to quick edit in 3D.4.
useToolStore.setState({ hidden: ["redact"] });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
