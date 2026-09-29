import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { LandingPage } from "./LandingPage.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/app") ? <App /> : <LandingPage />}
  </React.StrictMode>
);
