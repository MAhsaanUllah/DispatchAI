import {
  AgentEvent,
  AvailableSlot,
  Customer,
  Property,
  ServiceType,
  Urgency,
  WorkOrder
} from "@dispatchai/shared";

export interface PendingConfirmationAction {
  type: "CREATE_WORK_ORDER" | "RESCHEDULE_WORK_ORDER" | "CANCEL_WORK_ORDER";
  description: string;
  payload: any;
  createdAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: string;
}

export interface AgentState {
  sessionId: string;
  elevenLabsConversationId?: string;
  customer: Customer | null;
  selectedProperty: Property | null;
  serviceType: ServiceType | null;
  issueSummary: string | null;
  urgency: Urgency;
  queriedDate: string | null;
  availableSlots: AvailableSlot[];
  selectedSlot: AvailableSlot | null;
  pendingAction: PendingConfirmationAction | null;
  activeWorkOrder: WorkOrder | null;
  history: ConversationMessage[];
  events: AgentEvent[];
}

export function createInitialAgentState(sessionId: string): AgentState {
  return {
    sessionId,
    elevenLabsConversationId: undefined,
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
    history: [],
    events: []
  };
}
