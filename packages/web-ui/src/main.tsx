import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import SubpolarApp from "./SubpolarApp";
import { ThemeProvider } from "./themes";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider>
      <SubpolarApp />
    </ThemeProvider>
  </BrowserRouter>,
);
