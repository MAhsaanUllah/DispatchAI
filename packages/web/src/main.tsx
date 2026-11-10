import React, { Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { LandingPage } from "./LandingPage.js";
import { PublicDashboard } from "./PublicDashboard.js";
import { SetupPage } from "./SetupPage.js";
import "./index.css";

const App = React.lazy(() => import("./App.js").then((module) => ({ default: module.App })));

// Shows the one-time setup screen until the owner account exists, then the dashboard.
function Dashboard() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/setup/status")
      .then((response) => response.json())
      .then((body) => setNeedsSetup(body?.data?.needsSetup === true))
      .catch(() => setNeedsSetup(false));
  }, []);
  if (needsSetup === null) return <div>Loading dashboard...</div>;
  if (needsSetup) return <SetupPage onDone={() => setNeedsSetup(false)} />;
  return <Suspense fallback={<div>Loading dashboard...</div>}><App /></Suspense>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/app")
      ? import.meta.env.MODE === "cloudflare" ? <PublicDashboard /> : <Dashboard />
      : <LandingPage />}
  </React.StrictMode>
);
