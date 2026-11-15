import React, { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar.js";
import { StatsBar } from "./components/StatsBar.js";
import { JobsTable } from "./components/JobsTable.js";
import { WorkOrderDrawer } from "./components/WorkOrderDrawer.js";
import { AgentChat } from "./components/AgentChat.js";
import { EventTimeline } from "./components/EventTimeline.js";
import { TestCall } from "./TestCall.js";
import { api, type Directory } from "./api.js";
import { DirectoryPanel } from "./components/DirectoryPanel.js";
import { SystemPanel } from "./components/SystemPanel.js";
import { BusinessWizard } from "./BusinessWizard.js";
import { PluginsPage } from "./PluginsPage.js";
import { InboxPage } from "./InboxPage.js";
import { TeamLogins } from "./TeamLogins.js";
import { LocalNotification, WorkOrder } from "@dispatchai/shared";
import { MessageSquare, Activity, Briefcase } from "lucide-react";

export const App: React.FC = () => {
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [isOwner, setIsOwner] = useState(true);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((body) => setIsOwner(body?.data?.role !== "staff")).catch(() => undefined);
  }, []);
  const [activeView, setActiveView] = useState<"dispatch" | "team" | "services" | "company" | "system" | "plugins" | "inbox">("dispatch");
  const [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [agentState, setAgentState] = useState(api.getAgent().getState());
  const [activeConsoleTab, setActiveConsoleTab] = useState<"chat" | "events" | "outbox">("chat");
  const [mobileActiveView, setMobileActiveView] = useState<"jobs" | "agent">("jobs");
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null);
  const [austinTime, setAustinTime] = useState("");

  // Local clock in the business time zone (from onboarding).
  const businessTimeZone = directory?.company.timeZone ?? "America/Chicago";
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setAustinTime(
        now.toLocaleTimeString("en-US", {
          timeZone: businessTimeZone,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short"
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [businessTimeZone]);

  // Initialize jobs and subscribe to agent events
  useEffect(() => {
    void api.getDirectory().then(setDirectory).catch(() => setDirectory(null)).finally(() => setDirectoryLoading(false));
    void Promise.all([api.refreshState(), api.getJobs(), api.getNotifications()]).then(([nextState, nextJobs, nextNotifications]) => {
      setAgentState({ ...nextState });
      setJobs(nextJobs);
      setNotifications(nextNotifications);
      setAgentConnected(true);
    }).catch(() => setAgentConnected(false));

    const unsubscribe = api.subscribeEvents((event) => {
      setAgentState({ ...api.getAgent().getState() });

      if (
        event.type === "WORK_ORDER_CREATED" ||
        event.type === "WORK_ORDER_RESCHEDULED" ||
        event.type === "WORK_ORDER_CANCELLED"
      ) {
        void api.getJobs().then(setJobs);
        void api.getNotifications().then(setNotifications);
      }
    }, (connected) => setAgentConnected(connected));

    return () => unsubscribe();
  }, []);

  const handleResetData = async () => {
    if (!window.confirm("Reset all local bookings and pending notices to seed data? This cannot be undone.")) return;
    const resetJobs = await api.resetDemoData();
    setJobs(resetJobs);
    setNotifications([]);
    setSelectedJob(null);
    setAgentState({ ...api.getAgent().getState() });
  };

  const handleSendMessage = async (text: string) => {
    setIsLoading(true);
    try {
      await api.sendMessage(text);
      setAgentState({ ...api.getAgent().getState() });
      setJobs(await api.getJobs());
      setNotifications(await api.getNotifications());
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await api.confirmPending();
      setAgentState({ ...api.getAgent().getState() });
      setJobs(await api.getJobs());
      setNotifications(await api.getNotifications());
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    await api.rejectPending();
    setAgentState({ ...api.getAgent().getState() });
  };

  const handleQuickAction = async (actionText: string) => {
    setActiveConsoleTab("chat");
    setMobileActiveView("agent");
    await handleSendMessage(actionText);
  };

  return (
    <div style={{ height: "100vh", maxHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "var(--background)", overflow: "hidden" }}>
      {/* Shell Header */}
      <Navbar onLogout={() => void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.reload())} onReset={handleResetData} austinTime={austinTime} companyName={directory?.company.name} isOwner={isOwner} onOpenVoiceModal={() => setIsVoiceModalOpen(true)} activeView={activeView} onViewChange={setActiveView} />

      <main style={{ padding: "14px 24px 16px", maxWidth: "1680px", margin: "0 auto", width: "100%", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: activeView === "dispatch" ? "hidden" : "auto" }}>
        {activeView === "company" && editingBusiness ? <BusinessWizard onDone={() => window.location.reload()} onCancel={() => setEditingBusiness(false)} />
          : activeView === "inbox" ? <InboxPage /> : activeView === "plugins" ? <PluginsPage /> : activeView === "system" ? <SystemPanel /> : activeView !== "dispatch" ? <>
            {activeView === "team" && isOwner && <TeamLogins />}
            {activeView === "company" && isOwner && (
              <button onClick={() => setEditingBusiness(true)} style={{ alignSelf: "flex-end", marginBottom: 12, padding: "7px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                Edit business
              </button>
            )}
            <DirectoryPanel view={activeView} directory={directory} loading={directoryLoading} />
          </> : <>
        {/* Compact Operational Summary (Section 15) */}
        <StatsBar jobs={jobs} companyName={directory?.company.name} timeZone={businessTimeZone} />

        {/* Tablet / Mobile Segmented Switcher (Section 38 & 39) */}
        <div style={{
          display: "flex",
          gap: "6px",
          marginBottom: "12px",
          backgroundColor: "var(--surface)",
          padding: "3px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)"
        }} className="show-on-tablet-only">
          <button
            onClick={() => setMobileActiveView("jobs")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "var(--radius-xs)",
              border: "none",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              backgroundColor: mobileActiveView === "jobs" ? "var(--surface-subtle)" : "transparent",
              color: mobileActiveView === "jobs" ? "var(--text-primary)" : "var(--text-secondary)"
            }}
          >
            <Briefcase size={14} />
            <span>Work Orders ({jobs.length})</span>
          </button>

          <button
            onClick={() => setMobileActiveView("agent")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "var(--radius-xs)",
              border: "none",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              backgroundColor: mobileActiveView === "agent" ? "var(--surface-subtle)" : "transparent",
              color: mobileActiveView === "agent" ? "var(--accent)" : "var(--text-secondary)"
            }}
          >
            <MessageSquare size={14} />
            <span>DispatchAgent</span>
            {agentState.pendingAction && (
              <span style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "var(--warning)"
              }} />
            )}
          </button>
        </div>

        {/* Main Operational Workspace Layout (Section 37) */}
        <div className="operations-layout">
          {/* Work Orders List Panel (~65% desktop) */}
          <div style={{ display: mobileActiveView === "jobs" ? "block" : "none" }} className="desktop-view-container">
            <JobsTable
              jobs={jobs}
              selectedJobId={selectedJob?.id || null}
              onSelectJob={(job) => setSelectedJob(job)}
            />
          </div>

          {/* Right Console: Agent Chat + Realtime Event Stream (~35% desktop) */}
          <div style={{ display: mobileActiveView === "agent" ? "flex" : "none" }} className="desktop-view-container agent-column-container">
            <AgentChat
              state={agentState}
              notifications={notifications}
              connected={agentConnected}
              onSendMessage={handleSendMessage}
              onConfirm={handleConfirm}
              onReject={handleReject}
              isLoading={isLoading}
              activeTab={activeConsoleTab}
              onTabChange={setActiveConsoleTab}
            />
          </div>
        </div>
        </>}
      </main>

      {/* Work-Order Slide-Over Drawer */}
      <WorkOrderDrawer
        job={selectedJob}
        events={agentState.events}
        onClose={() => setSelectedJob(null)}
        onQuickAction={handleQuickAction}
      />

      {/* Owner Test call: browser speech + the same engine as the phone line (ElevenLabs is not used in v1). */}
      <TestCall
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onTurn={() => {
          void api.getJobs().then(setJobs);
          void api.getNotifications().then(setNotifications);
        }}
      />

      <style>{`
        @media (min-width: 1101px) {
          .show-on-tablet-only {
            display: none !important;
          }
          .desktop-view-container {
            display: flex !important;
            flex-direction: column !important;
            height: 100% !important;
            min-height: 0 !important;
            overflow: hidden !important;
          }
        }
      `}</style>
    </div>
  );
};
