import React from "react";
import { createRoot } from "react-dom/client";

import "@abstractframework/ui-kit/theme.css";
import "@abstractframework/panel-chat/panel_chat.css";
import "./ui/styles.css";
import { App } from "./app";

const el = document.getElementById("root");
if (!el) throw new Error("root element missing");
createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
