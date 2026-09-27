import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { blockBrowserUi } from "../shared/browserUi";
import "./overlay.css";
import { OverlayApp } from "./OverlayApp";

blockBrowserUi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
