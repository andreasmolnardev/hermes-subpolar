import { createRoot } from "react-dom/client";
import "./index.css";
import SubpolarApp from "./SubpolarApp";
import { ThemeProvider } from "./themes";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <SubpolarApp />
  </ThemeProvider>,
);
