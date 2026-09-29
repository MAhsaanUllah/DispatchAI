import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { LandingPage } from "./LandingPage.js";
import { PublicDashboard } from "./PublicDashboard.js";
import "./index.css";

const App = React.lazy(() => import("./App.js").then((module) => ({ default: module.App })));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/app")
      ? import.meta.env.MODE === "cloudflare" ? <PublicDashboard /> : <Suspense fallback={<div>Loading dashboard...</div>}><App /></Suspense>
      : <LandingPage />}
  </React.StrictMode>
);
