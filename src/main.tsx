import React from "react";
import { createRoot } from "react-dom/client";

import "@abstractframework/ui-kit/theme.css";
import "@abstractframework/panel-chat/panel_chat.css";
import "./ui/styles.css";
import "./ui/space.css";
import { installViewportVars } from "@abstractframework/ui-kit";

import { App } from "./app";

// --vv-height / --keyboard-inset for iOS (DESIGN §4.3): the composers and
// sheets stay above the on-screen keyboard. Idempotent.
installViewportVars();

const el = document.getElementById("root");
if (!el) throw new Error("root element missing");
createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
