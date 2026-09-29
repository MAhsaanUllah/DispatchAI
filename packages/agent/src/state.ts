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

export interface RescheduleContext {
  workOrderId: string;
  serviceType: ServiceType;
  serviceZone: string;
}

// Identity of the last booking this session actually executed, used to absorb immediate replays.
export interface SuccessfulCreateRecord {
  workOrder: WorkOrder;
  customerId: string;
  propertyId: string;
  serviceType: ServiceType;
  slotId: string;
  completedAt: string;
}

export interface AgentState {
  sessionId: string;
  elevenLabsConversationId?: string;
  visitorName?: string;
  visitorEmail?: string;
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
  lastCreatedWorkOrderId: string | null;
  lastSuccessfulCreate: SuccessfulCreateRecord | null;
  rescheduleContext: RescheduleContext | null;
  history: ConversationMessage[];
  events: AgentEvent[];
}

export function createInitialAgentState(sessionId: string): AgentState {
  return {
    sessionId,
    elevenLabsConversationId: undefined,
    visitorName: undefined,
    visitorEmail: undefined,
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
}
