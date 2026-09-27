import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { blockBrowserShortcuts } from "../shared/browserKeys";
import "./overlay.css";
import { OverlayApp } from "./OverlayApp";

blockBrowserShortcuts();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
