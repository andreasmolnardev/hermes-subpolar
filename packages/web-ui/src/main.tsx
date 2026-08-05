import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import { HERMES_BASE_PATH } from "./lib/api";
import SubpolarApp from "./SubpolarApp";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter basename={HERMES_BASE_PATH || undefined}>
    <SubpolarApp />
  </BrowserRouter>,
);
