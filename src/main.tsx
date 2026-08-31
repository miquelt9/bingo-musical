import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initWebAnalytics } from "./lib/analytics/webAnalytics";
import "@miquelt9/pc-ui/pc-ui.css";
import "./index.css";

initWebAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
