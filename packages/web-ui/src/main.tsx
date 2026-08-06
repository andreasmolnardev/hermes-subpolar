import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import SubpolarApp from "./SubpolarApp";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <SubpolarApp />
  </BrowserRouter>,
);
