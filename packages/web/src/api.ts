import type { AgentState } from "@dispatchai/agent";
import type { AgentEvent, LocalNotification, WorkOrder } from "@dispatchai/shared";

export type Directory = {
  company: { name: string; market: string; timeZone: string; serviceZones: string[]; note: string };
  services: { id: string; name: string; description: string; priceNote: string }[];
  technicians: { id: string; name: string; skills: string[]; serviceZones: string[]; status: string; upcomingSlots: { id: string; startAt: string; endAt: string; status: string }[] }[];
};

const baseUrl = (((import.meta as any).env?.VITE_AGENT_API_URL) || "").replace(/\/$/, "");
const sessionId = "austin_dispatch_web_session";

let state: AgentState = {
  sessionId,
  customer: null,
  selectedProperty: null,
  serviceType: null,
  issueSummary: null,
  urgency: "STANDARD",
  queriedDate: null,
  availableSlots: [],
  selectedSlot: null,
  pendingAction: null,
  activeWorkOrder: null,
  lastCreatedWorkOrderId: null,
  lastSuccessfulCreate: null,
  rescheduleContext: null,
  history: [],
  events: []
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-session-id": sessionId,
      ...init?.headers
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error((typeof body?.error === "string" ? body.error : body?.error?.message) || body?.envelope?.error?.message || `Request failed (${response.status})`);
  return body as T;
}

async function refreshState(): Promise<AgentState> {
  state = await request<AgentState>("/api/state");
  return state;
}

export const api = {
  getAgent() {
    return { getState: () => state };
  },

  refreshState,

  async getJobs(): Promise<WorkOrder[]> {
    const response = await request<{ ok: true; data: { jobs: WorkOrder[] } }>("/api/jobs");
    return response.data.jobs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  },

  async getNotifications(): Promise<LocalNotification[]> {
    const response = await request<{ ok: true; data: { notifications: LocalNotification[] } }>("/api/notifications");
    return response.data.notifications;
  },

  async getDirectory(): Promise<Directory> {
    const response = await request<{ ok: true; data: Directory }>("/api/directory");
    return response.data;
  },

  async sendMessage(text: string): Promise<{ reply: string; events: AgentEvent[] }> {
    const response = await request<{ reply: string; state: AgentState; events: AgentEvent[] }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: text })
    });
    state = response.state;
    return response;
  },

  async confirmPending(): Promise<unknown> {
    const response = await request<unknown>("/api/confirm", { method: "POST", body: "{}" });
    await refreshState();
    return response;
  },

  async rejectPending(): Promise<unknown> {
    const response = await request<unknown>("/api/reject", { method: "POST", body: "{}" });
    await refreshState();
    return response;
  },

  async resetDemoData(): Promise<WorkOrder[]> {
    await request("/api/reset", { method: "POST", body: JSON.stringify({ confirm: "RESET_LOCAL_DATA" }) });
    await refreshState();
    return this.getJobs();
  },

  async createVoiceSession(requestedSessionId: string, visitor?: { name: string; email?: string; persona?: string }): Promise<any> {
    return request("/api/voice/session", {
      method: "POST",
      body: JSON.stringify(import.meta.env.MODE === "cloudflare" ? {} : { sessionId: requestedSessionId, visitorName: visitor?.name, visitorEmail: visitor?.email })
    });
  },

  async executeVoiceTool(toolName: string, parameters: any, voiceToolToken: string, convId?: string, requestedSessionId = sessionId): Promise<any> {
    return request(`/api/voice/tools/${toolName}`, {
      method: "POST",
      headers: { "x-voice-session-token": voiceToolToken, "x-session-id": requestedSessionId },
      body: JSON.stringify({ tool_name: toolName, parameters, conversation_id: convId })
    });
  },

  async endVoiceSession(voiceToolToken: string) {
    return request("/api/voice/end", { method: "POST", headers: { "x-voice-session-token": voiceToolToken }, body: "{}", keepalive: true });
  },

  async sendChatMessage(text: string, _sessionId?: string): Promise<{ reply: string; events: AgentEvent[] }> {
    return this.sendMessage(text);
  },

  subscribeEvents(callback: (event: AgentEvent) => void, onConnectionChange?: (connected: boolean) => void) {
    let lastEventId = state.events.at(-1)?.id;
    const timer = window.setInterval(async () => {
      try {
        const next = await refreshState();
        onConnectionChange?.(true);
        const newEvents = lastEventId
          ? next.events.slice(next.events.findIndex((event) => event.id === lastEventId) + 1)
          : next.events;
        for (const event of newEvents) callback(event);
        lastEventId = next.events.at(-1)?.id;
      } catch {
        // A later poll restores current state after a temporary disconnect.
        onConnectionChange?.(false);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }
};
