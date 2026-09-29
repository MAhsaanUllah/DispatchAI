import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { LandingPage } from "./LandingPage.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/app") && import.meta.env.MODE === "cloudflare"
      ? <main style={{ maxWidth: 620, margin: "15vh auto", padding: 24, fontFamily: "Inter, sans-serif" }}><a href="/">← DispatchAI</a><h1>Staff dashboard is part of the guided demo</h1><p>This public preview does not connect to the local operations database. The full dashboard, n8n workflows and voice tools run together in the local demo environment.</p></main>
      : window.location.pathname.startsWith("/app") ? <App /> : <LandingPage />}
  </React.StrictMode>
);
