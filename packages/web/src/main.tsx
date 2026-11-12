import React, { Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { SetupPage } from "./SetupPage.js";
import { LoginPage } from "./LoginPage.js";
import { BusinessWizard } from "./BusinessWizard.js";
import "./index.css";

const App = React.lazy(() => import("./App.js").then((module) => ({ default: module.App })));

type Gate = "loading" | "setup" | "login" | "onboarding" | "dashboard";

// One-time setup until an owner exists, then PIN login, then onboarding until the business is saved, then the dashboard.
function Dashboard() {
  const [gate, setGate] = useState<Gate>("loading");
  const check = () => {
    fetch("/api/setup/status")
      .then((response) => response.json())
      .then(async (body) => {
        if (body?.data?.needsSetup === true) return setGate("setup");
        const me = await fetch("/api/auth/me").then((response) => response.json());
        if (me?.data?.authenticated !== true) return setGate("login");
        // Onboarding is the owner's job; staff go straight to the dashboard.
        if (me?.data?.role === "staff") return setGate("dashboard");
        const [business, directory] = await Promise.all([fetch("/api/business"), fetch("/api/directory")].map((p) => p.then((response) => response.json())));
        // Onboarding is finished once the business is saved and at least one staff member exists (step 3).
        const done = business?.data?.configured === true && (directory?.data?.technicians?.length ?? 0) > 0;
        setGate(done ? "dashboard" : "onboarding");
      })
      .catch(() => setGate("login"));
  };
  useEffect(check, []);
  if (gate === "loading") return <div className="boot">Loading dashboard…</div>;
  if (gate === "setup") return <SetupPage onDone={() => setGate("login")} />;
  if (gate === "login") return <LoginPage onDone={check} />;
  if (gate === "onboarding") return <BusinessWizard onDone={() => setGate("dashboard")} />;
  return <Suspense fallback={<div>Loading dashboard...</div>}><App /></Suspense>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>
);
