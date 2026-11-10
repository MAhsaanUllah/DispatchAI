import React, { Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { LandingPage } from "./LandingPage.js";
import { PublicDashboard } from "./PublicDashboard.js";
import { SetupPage } from "./SetupPage.js";
import { LoginPage } from "./LoginPage.js";
import "./index.css";

const App = React.lazy(() => import("./App.js").then((module) => ({ default: module.App })));

type Gate = "loading" | "setup" | "login" | "dashboard";

// One-time setup until an owner exists, then PIN login, then the dashboard.
function Dashboard() {
  const [gate, setGate] = useState<Gate>("loading");
  const check = () => {
    fetch("/api/setup/status")
      .then((response) => response.json())
      .then(async (body) => {
        if (body?.data?.needsSetup === true) return setGate("setup");
        const me = await fetch("/api/auth/me").then((response) => response.json());
        setGate(me?.data?.authenticated === true ? "dashboard" : "login");
      })
      .catch(() => setGate("login"));
  };
  useEffect(check, []);
  if (gate === "loading") return <div>Loading dashboard...</div>;
  if (gate === "setup") return <SetupPage onDone={() => setGate("login")} />;
  if (gate === "login") return <LoginPage onDone={() => setGate("dashboard")} />;
  return <Suspense fallback={<div>Loading dashboard...</div>}><App /></Suspense>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/app")
      ? import.meta.env.MODE === "cloudflare" ? <PublicDashboard /> : <Dashboard />
      : <LandingPage />}
  </React.StrictMode>
);
