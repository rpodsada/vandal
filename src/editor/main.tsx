import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { blockBrowserShortcuts } from "../shared/browserKeys";
import { EditorApp } from "./EditorApp";

blockBrowserShortcuts();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EditorApp />
  </StrictMode>,
);
