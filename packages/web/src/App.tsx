import React, { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar.js";
import { StatsBar } from "./components/StatsBar.js";
import { JobsTable } from "./components/JobsTable.js";
import { WorkOrderDrawer } from "./components/WorkOrderDrawer.js";
import { AgentChat } from "./components/AgentChat.js";
import { EventTimeline } from "./components/EventTimeline.js";
import { VoiceAgentControl } from "./components/VoiceAgentControl.js";
import { api } from "./api.js";
import { LocalNotification, WorkOrder } from "@dispatchai/shared";
import { MessageSquare, Activity, Briefcase } from "lucide-react";

export const App: React.FC = () => {
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [agentState, setAgentState] = useState(api.getAgent().getState());
  const [activeConsoleTab, setActiveConsoleTab] = useState<"chat" | "events" | "outbox">("chat");
  const [mobileActiveView, setMobileActiveView] = useState<"jobs" | "agent">("jobs");
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [austinTime, setAustinTime] = useState("");

  // Update Austin Local Clock (CDT)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setAustinTime(
        now.toLocaleTimeString("en-US", {
          timeZone: "America/Chicago",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }) + " CDT"
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize jobs and subscribe to agent events
  useEffect(() => {
    void Promise.all([api.refreshState(), api.getJobs(), api.getNotifications()]).then(([nextState, nextJobs, nextNotifications]) => {
      setAgentState({ ...nextState });
      setJobs(nextJobs);
      setNotifications(nextNotifications);
    });

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
    });

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
      <Navbar onReset={handleResetData} austinTime={austinTime} onOpenVoiceModal={() => setIsVoiceModalOpen(true)} />

      <main style={{ padding: "14px 24px 16px", maxWidth: "1680px", margin: "0 auto", width: "100%", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Compact Operational Summary (Section 15) */}
        <StatsBar jobs={jobs} />

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
              onSendMessage={handleSendMessage}
              onConfirm={handleConfirm}
              onReject={handleReject}
              isLoading={isLoading}
              activeTab={activeConsoleTab}
              onTabChange={setActiveConsoleTab}
            />
          </div>
        </div>
      </main>

      {/* Work-Order Slide-Over Drawer */}
      <WorkOrderDrawer
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onQuickAction={handleQuickAction}
      />

      {/* ElevenLabs Voice Agent Control Surface */}
      <VoiceAgentControl
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        sessionId="austin_dispatch_web_session"
        onEventEmitted={() => {
          void api.refreshState().then((nextState) => setAgentState({ ...nextState }));
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
