import React, { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar.js";
import { StatsBar } from "./components/StatsBar.js";
import { TodaySummary } from "./components/TodaySummary.js";
import { JobsTable } from "./components/JobsTable.js";
import { WorkOrderDrawer } from "./components/WorkOrderDrawer.js";
import { AgentChat } from "./components/AgentChat.js";
import { TestCall } from "./TestCall.js";
import { api, type Directory } from "./api.js";
import { DirectoryPanel } from "./components/DirectoryPanel.js";
import { SystemPanel } from "./components/SystemPanel.js";
import { BusinessWizard } from "./BusinessWizard.js";
import { PluginsPage } from "./PluginsPage.js";
import { InboxPage } from "./InboxPage.js";
import { TeamLogins } from "./TeamLogins.js";
import { LocalNotification, WorkOrder } from "@dispatchai/shared";

export const App: React.FC = () => {
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [isOwner, setIsOwner] = useState(true);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((body) => setIsOwner(body?.data?.role !== "staff")).catch(() => undefined);
  }, []);
  // Onboarding can ask to land on Features once, when there is something left to connect.
  const [activeView, setActiveView] = useState<"dispatch" | "team" | "services" | "company" | "system" | "plugins" | "inbox">(() => {
    try {
      const wanted = sessionStorage.getItem("dispatch.view");
      sessionStorage.removeItem("dispatch.view");
      if (wanted === "plugins") return "plugins";
    } catch { /* storage can be blocked */ }
    return "dispatch";
  });
  const [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [agentState, setAgentState] = useState(api.getAgent().getState());
  const [activeConsoleTab, setActiveConsoleTab] = useState<"chat" | "events" | "outbox">("chat");
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null);
  const [localTime, setLocalTime] = useState("");

  // A view switch starts at the top of the new screen; the pages are longer than the viewport.
  // The phone nav strip also rewinds, so the chosen cell leads the row instead of sitting off-screen.
  useEffect(() => {
    document.querySelector(".app-main")?.scrollTo({ top: 0 });
    document.querySelector(".app-nav__links")?.scrollTo({ left: 0 });
    window.scrollTo({ top: 0 });
  }, [activeView]);

  // Local clock in the business time zone (from onboarding).
  const businessTimeZone = directory?.company.timeZone ?? "America/Chicago";
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLocalTime(
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
    }).catch(() => setAgentConnected(false)).finally(() => setJobsLoading(false));

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
    await handleSendMessage(actionText);
  };

  const isBoard = activeView === "dispatch";

  return (
    <div className="app-shell">
      <Navbar onLogout={() => void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.reload())} onReset={handleResetData} austinTime={localTime} companyName={directory?.company.name} isOwner={isOwner} demo={directory?.demo} onOpenVoiceModal={() => setIsVoiceModalOpen(true)} activeView={activeView} onViewChange={setActiveView} />

      <main className="app-main">
        {activeView === "company" && editingBusiness ? <BusinessWizard onDone={() => window.location.reload()} onCancel={() => setEditingBusiness(false)} />
          : activeView === "inbox" ? <InboxPage />
            : activeView === "plugins" ? <PluginsPage />
              : activeView === "system" ? <SystemPanel onOpenPlugins={() => setActiveView("plugins")} />
                : !isBoard ? (
                  <div className="app-body">
                    <DirectoryPanel
                      view={activeView}
                      directory={directory}
                      loading={directoryLoading}
                      onEdit={activeView === "company" && isOwner ? () => setEditingBusiness(true) : undefined}
                    />
                    {activeView === "team" && isOwner && <TeamLogins />}
                  </div>
                ) : (
                  <div className="app-body app-body--flush">
                    <div className="split">
                      <div className="split__main board">
                        <StatsBar jobs={jobs} companyName={directory?.company.name} />
                        <TodaySummary jobs={jobs} />
                        <JobsTable
                          jobs={jobs}
                          selectedJobId={selectedJob?.id || null}
                          onSelectJob={(job) => setSelectedJob(job)}
                          loading={jobsLoading}
                          onTestCall={() => setIsVoiceModalOpen(true)}
                        />
                      </div>
                      <div className="split__side">
                        <AgentChat
                          state={agentState}
                          notifications={notifications}
                          connected={agentConnected}
                          business={{
                            name: directory?.company.name,
                            services: directory?.services.map((service) => ({ id: service.id, name: service.name })) ?? [],
                            zones: directory?.company.serviceZones ?? [],
                            jobId: jobs[0]?.id
                          }}
                          onSendMessage={handleSendMessage}
                          onConfirm={handleConfirm}
                          onReject={handleReject}
                          isLoading={isLoading}
                          activeTab={activeConsoleTab}
                          onTabChange={setActiveConsoleTab}
                        />
                      </div>
                    </div>
                  </div>
                )}
      </main>

      <WorkOrderDrawer
        job={selectedJob}
        events={agentState.events}
        onClose={() => setSelectedJob(null)}
        onQuickAction={handleQuickAction}
      />

      <TestCall
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onTurn={() => {
          void api.getJobs().then(setJobs);
          void api.getNotifications().then(setNotifications);
        }}
      />
    </div>
  );
};
