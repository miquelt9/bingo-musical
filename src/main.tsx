import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "@miquelt9/pc-ui/pc-ui.css";
import "./index.css";

void import("./lib/usage/cfBeacon")
  .then(({ initCfBeacon }) => initCfBeacon())
  .catch(() => {
    // Optional; ad blockers may reject the module URL.
  });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
