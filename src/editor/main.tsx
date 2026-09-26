import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";

// Placeholder until Phase 2.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <p>Editor</p>
  </StrictMode>,
);
