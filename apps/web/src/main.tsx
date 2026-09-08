import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";
import "./review.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing React root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
