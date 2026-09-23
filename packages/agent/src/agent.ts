import {
  AgentEvent,
  AgentEventType,
  AvailableSlot,
  Customer,
  Property,
  ServiceType,
  Urgency,
  WorkOrder
} from "@dispatchai/shared";
import { N8nClient } from "./client.js";
import { AgentState, ConversationMessage, createInitialAgentState, PendingConfirmationAction } from "./state.js";

export type EventListener = (event: AgentEvent) => void;

export function serviceDate(offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const date = new Date(Date.UTC(value("year"), value("month") - 1, value("day") + offsetDays));
  return date.toISOString().slice(0, 10);
}

export class DispatchAgent {
  private state: AgentState;
  private n8n: N8nClient;
  private listeners: Set<EventListener> = new Set();

  constructor(sessionId: string, n8n: N8nClient, initialState?: Partial<AgentState>) {
    this.n8n = n8n;
    this.state = {
      ...createInitialAgentState(sessionId),
      ...initialState
    };
  }

  public getState(): AgentState {
    return { ...this.state };
  }

  public setElevenLabsConversationId(conversationId: string) {
    this.state.elevenLabsConversationId = conversationId;
    const correlationId = this.generateCorrelationId();
    this.emit("STATE_UPDATED", correlationId, undefined, { elevenLabsConversationId: conversationId });
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(
    type: AgentEventType,
    correlationId: string,
    toolName?: string,
    payload?: any,
    message?: string
  ): AgentEvent {
    const event: AgentEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      timestamp: new Date().toISOString(),
      correlationId,
      toolName,
      payload,
      message
    };

    this.state.events.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in event listener", err);
      }
    }
    return event;
  }

  private generateCorrelationId(): string {
    return `agent_corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  // Controlled Tool 1: find_customer
  public async findCustomer(phone: string, correlationId = this.generateCorrelationId()) {
    this.emit("TOOL_CALL_STARTED", correlationId, "find_customer", { phone });

    const result = await this.n8n.findCustomer({ phone }, correlationId);
    if (!result.ok) {
      this.emit("TOOL_CALL_FAILED", correlationId, "find_customer", result.error);
      return result;
    }

    this.state.customer = result.data.customer;
    if (result.data.properties.length > 0) {
      this.state.selectedProperty = result.data.properties[0];
    }

    this.emit("TOOL_CALL_COMPLETED", correlationId, "find_customer", result.data);
    this.emit("STATE_UPDATED", correlationId, undefined, { customer: this.state.customer, property: this.state.selectedProperty });
    return result;
  }

  // Controlled Tool 2: check_availability
  public async checkAvailability(
    serviceType: ServiceType,
    serviceZone: string,
    date: string,
    preferredWindow?: { start: string; end: string },
    correlationId = this.generateCorrelationId()
  ) {
    this.emit("TOOL_CALL_STARTED", correlationId, "check_availability", { serviceType, serviceZone, date, preferredWindow });

    const result = await this.n8n.checkAvailability(
      { serviceType, serviceZone, date, preferredWindow },
      correlationId
    );

    if (!result.ok) {
      this.emit("TOOL_CALL_FAILED", correlationId, "check_availability", result.error);
      return result;
    }

    this.state.serviceType = serviceType;
    this.state.queriedDate = date;
    this.state.availableSlots = result.data.slots;
    this.state.selectedSlot = null; // Reset previously selected slot

    this.emit("TOOL_CALL_COMPLETED", correlationId, "check_availability", result.data);
    this.emit("STATE_UPDATED", correlationId, undefined, { availableSlots: this.state.availableSlots });
    return result;
  }

  // Controlled Tool 4: get_work_order
  public async getWorkOrder(workOrderId: string, correlationId = this.generateCorrelationId()) {
    this.emit("TOOL_CALL_STARTED", correlationId, "get_work_order", { workOrderId });

    const result = await this.n8n.getWorkOrder({ workOrderId }, correlationId);
    if (!result.ok) {
      this.emit("TOOL_CALL_FAILED", correlationId, "get_work_order", result.error);
      return result;
    }

    this.state.activeWorkOrder = result.data.workOrder;
    this.emit("TOOL_CALL_COMPLETED", correlationId, "get_work_order", result.data);
    this.emit("STATE_UPDATED", correlationId, undefined, { activeWorkOrder: this.state.activeWorkOrder });
    return result;
  }

  // Mutation Step 1: Propose booking (Enforces explicit confirmation)
  public proposeBooking(slotId: string, issueSummary?: string, urgency: Urgency = "STANDARD", createdBy: "VOICE_AGENT" | "WEB_AGENT" = "WEB_AGENT") {
    const slot = this.state.availableSlots.find((s) => s.slotId === slotId);
    if (!slot) {
      throw new Error(`Slot ${slotId} is not in current available slots. Check availability first.`);
    }

    if (!this.state.customer || !this.state.selectedProperty || !this.state.serviceType) {
      throw new Error("Cannot propose booking without customer, property, and serviceType context.");
    }

    this.state.selectedSlot = slot;
    if (issueSummary) this.state.issueSummary = issueSummary;
    this.state.urgency = urgency;

    const action: PendingConfirmationAction = {
      type: "CREATE_WORK_ORDER",
      description: `Book ${slot.technicianName} for ${this.state.serviceType} on ${slot.startAt} at ${this.state.selectedProperty.addressLine1}`,
      payload: {
        idempotencyKey: `idem_agent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        customerId: this.state.customer.id,
        propertyId: this.state.selectedProperty.id,
        serviceType: this.state.serviceType,
        issueSummary: this.state.issueSummary || "Scheduled field-service maintenance",
        urgency: this.state.urgency,
        slotId: slot.slotId,
        createdBy
      },
      createdAt: new Date().toISOString()
    };

    this.state.pendingAction = action;
    const correlationId = this.generateCorrelationId();
    this.emit("CONFIRMATION_REQUIRED", correlationId, "create_work_order", action, action.description);
    return action;
  }

  // Mutation Step 1 (Reschedule): Propose reschedule
  public proposeReschedule(workOrderId: string, newSlotId: string) {
    const slot = this.state.availableSlots.find((s) => s.slotId === newSlotId);
    if (!slot) {
      throw new Error(`Target slot ${newSlotId} not found in available slots.`);
    }

    const action: PendingConfirmationAction = {
      type: "RESCHEDULE_WORK_ORDER",
      description: `Reschedule work order #${workOrderId} to ${slot.startAt} with ${slot.technicianName}`,
      payload: {
        idempotencyKey: `idem_resched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        workOrderId,
        newSlotId
      },
      createdAt: new Date().toISOString()
    };

    this.state.pendingAction = action;
    const correlationId = this.generateCorrelationId();
    this.emit("CONFIRMATION_REQUIRED", correlationId, "reschedule_work_order", action, action.description);
    return action;
  }

  // Mutation Step 1 (Cancel): Propose cancellation
  public proposeCancellation(workOrderId: string, reason?: string) {
    const action: PendingConfirmationAction = {
      type: "CANCEL_WORK_ORDER",
      description: `Cancel work order #${workOrderId}`,
      payload: {
        idempotencyKey: `idem_cancel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        workOrderId,
        reason: reason || "Cancelled via agent request"
      },
      createdAt: new Date().toISOString()
    };

    this.state.pendingAction = action;
    const correlationId = this.generateCorrelationId();
    this.emit("CONFIRMATION_REQUIRED", correlationId, "cancel_work_order", action, action.description);
    return action;
  }

  // Mutation Step 2: Affirmative confirmation execution
  public async confirmPendingAction(correlationId = this.generateCorrelationId()) {
    if (!this.state.pendingAction) {
      return { ok: false, message: "No pending action awaiting confirmation." };
    }

    const action = this.state.pendingAction;
    this.state.pendingAction = null; // Clear pending state

    if (action.type === "CREATE_WORK_ORDER") {
      this.emit("TOOL_CALL_STARTED", correlationId, "create_work_order", action.payload);
      const res = await this.n8n.createWorkOrder(action.payload, correlationId);
      if (!res.ok) {
        this.emit("TOOL_CALL_FAILED", correlationId, "create_work_order", res.error);
        return res;
      }

      this.state.activeWorkOrder = res.data.workOrder;
      this.emit("TOOL_CALL_COMPLETED", correlationId, "create_work_order", res.data);
      this.emit("WORK_ORDER_CREATED", correlationId, undefined, res.data.workOrder, `Work order #${res.data.workOrder.id} successfully booked.`);
      this.emit("STATE_UPDATED", correlationId, undefined, { activeWorkOrder: this.state.activeWorkOrder });
      return res;
    }

    if (action.type === "RESCHEDULE_WORK_ORDER") {
      this.emit("TOOL_CALL_STARTED", correlationId, "reschedule_work_order", action.payload);
      const res = await this.n8n.rescheduleWorkOrder(action.payload, correlationId);
      if (!res.ok) {
        this.emit("TOOL_CALL_FAILED", correlationId, "reschedule_work_order", res.error);
        return res;
      }

      this.state.activeWorkOrder = res.data.workOrder;
      this.emit("TOOL_CALL_COMPLETED", correlationId, "reschedule_work_order", res.data);
      this.emit("WORK_ORDER_RESCHEDULED", correlationId, undefined, res.data.workOrder, `Work order #${res.data.workOrder.id} rescheduled.`);
      this.emit("STATE_UPDATED", correlationId, undefined, { activeWorkOrder: this.state.activeWorkOrder });
      return res;
    }

    if (action.type === "CANCEL_WORK_ORDER") {
      this.emit("TOOL_CALL_STARTED", correlationId, "cancel_work_order", action.payload);
      const res = await this.n8n.cancelWorkOrder(action.payload, correlationId);
      if (!res.ok) {
        this.emit("TOOL_CALL_FAILED", correlationId, "cancel_work_order", res.error);
        return res;
      }

      this.state.activeWorkOrder = res.data.workOrder;
      this.emit("TOOL_CALL_COMPLETED", correlationId, "cancel_work_order", res.data);
      this.emit("WORK_ORDER_CANCELLED", correlationId, undefined, res.data.workOrder, `Work order #${res.data.workOrder.id} cancelled.`);
      this.emit("STATE_UPDATED", correlationId, undefined, { activeWorkOrder: this.state.activeWorkOrder });
      return res;
    }

    return { ok: false, message: "Unknown action type" };
  }

  // Reject / Cancel pending action
  public rejectPendingAction() {
    this.state.pendingAction = null;
    return { ok: true, message: "Pending action discarded." };
  }

  // Conversational text interaction pipeline
  public async processMessage(text: string): Promise<string> {
    const correlationId = this.generateCorrelationId();
    const cleanText = text.trim();

    // Record user message in history
    this.state.history.push({
      id: `msg_${Date.now()}_u`,
      role: "user",
      content: cleanText,
      timestamp: new Date().toISOString()
    });

    const lower = cleanText.toLowerCase();
    const dateChangeMatch = lower.match(/(actually|instead|rather|change).*(today|tomorrow|\d{4}-\d{2}-\d{2})/i) ||
      lower.match(/^(check|how about|what about)\s+(today|tomorrow|\d{4}-\d{2}-\d{2})/i);

    // 1. Pending confirmation handling
    if (this.state.pendingAction) {
      if (!dateChangeMatch && lower.match(/^(yes|confirm|book it|go ahead|proceed|sure|please do|ok|yep)(?:\b|$)/i)) {
        const result: any = await this.confirmPendingAction(correlationId);
        if (result.ok) {
          const wo = result.data?.workOrder;
          const reply = `I have confirmed your appointment! Work order #${wo.id} is booked with technician ${wo.technicianId} for ${wo.scheduledStart}. The demo confirmation was logged; no real message was sent.`;
          this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
          return reply;
        } else {
          const errorMsg = result.error?.message || "Operation failed.";
          const reply = `I could not complete the appointment confirmation: ${errorMsg}`;
          this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
          return reply;
        }
      } else if (lower.match(/^(no|cancel|wait|stop|don't|not now)/i)) {
        this.rejectPendingAction();
        const reply = "Understood, I have cancelled that proposed action. What else can I help you with?";
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      }
    }

    // 2. Interruption / Constraint Update Handling (e.g. "Actually, I need someone today", "Check tomorrow instead")
    if (dateChangeMatch) {
      const targetDate = dateChangeMatch[2].toLowerCase() === "today"
        ? serviceDate()
        : dateChangeMatch[2].toLowerCase() === "tomorrow"
        ? serviceDate(1)
        : dateChangeMatch[2];

      // Discard stale availability & pending action
      this.state.availableSlots = [];
      this.state.selectedSlot = null;
      this.state.pendingAction = null;

      const serviceType = this.state.serviceType || (lower.includes("plumb") ? "PLUMBING" : "HVAC");
      const serviceZone = this.state.selectedProperty?.serviceZone || "Austin-Central";

      const availResult = await this.checkAvailability(serviceType, serviceZone, targetDate, undefined, correlationId);
      if (availResult.ok && availResult.data.slots.length > 0) {
        const slotDescriptions = availResult.data.slots
          .slice(0, 3)
          .map((s) => `${s.technicianName} (${s.startAt.split("T")[1].substring(0, 5)})`)
          .join(", ");
        const reply = `I have updated your request to ${targetDate}. Available slots include: ${slotDescriptions}. Would you like to book one of these?`;
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      } else {
        const reply = `I checked availability for ${targetDate}, but unfortunately no technicians are available in ${serviceZone}.`;
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      }
    }

    // 3. Customer Identification (Phone number detection)
    const phoneMatch = cleanText.match(/\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/);
    if (phoneMatch) {
      const rawDigits = `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}`;
      const lookup = await this.findCustomer(rawDigits, correlationId);
      if (lookup.ok && lookup.data.customer) {
        const c = lookup.data.customer;
        const p = lookup.data.properties[0];
        const propAddress = p ? ` at ${p.addressLine1}` : "";
        const reply = `Hello ${c.firstName} ${c.lastName}! I have found your account${propAddress}. How can I assist with your HVAC or plumbing today?`;
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      } else {
        const reply = `I could not find an existing customer account for phone number ${phoneMatch[0]}. Could you verify the number?`;
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      }
    }

    // 4. Slot selection / Booking proposal (e.g. "Book the 10 AM slot", "Slot slot_303")
    if (this.state.availableSlots.length > 0) {
      const explicitSlot = this.state.availableSlots.find((s) => lower.includes(s.slotId.toLowerCase()));
      const timeMatch = lower.match(/(\d{1,2})\s*(am|pm)/i);
      let matchedSlot = explicitSlot;

      if (!matchedSlot && timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const isPm = timeMatch[2].toLowerCase() === "pm";
        if (isPm && hour < 12) hour += 12;
        const hourPrefix = hour < 10 ? `0${hour}` : `${hour}`;
        matchedSlot = this.state.availableSlots.find((s) => s.startAt.includes(`T${hourPrefix}:`));
      }

      if (matchedSlot) {
        const action = this.proposeBooking(matchedSlot.slotId, cleanText);
        const reply = `I can book ${matchedSlot.technicianName} for ${matchedSlot.startAt.slice(0, 10)} (${matchedSlot.startAt.split("T")[1].substring(0, 5)}) at ${this.state.selectedProperty?.addressLine1}. Would you like me to confirm that appointment?`;
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      }
    }

    // 5. Service request / Problem description (e.g. "AC blowing warm air", "Pipe burst")
    if (lower.includes("ac") || lower.includes("air condition") || lower.includes("hvac") || lower.includes("plumb") || lower.includes("leak") || lower.includes("drain")) {
      const isPlumbing = lower.includes("plumb") || lower.includes("pipe") || lower.includes("leak") || lower.includes("drain") || lower.includes("sink") || lower.includes("toilet");
      const serviceType: ServiceType = isPlumbing ? "PLUMBING" : "HVAC";
      this.state.serviceType = serviceType;
      this.state.issueSummary = cleanText;

      // Default to customer property zone or Austin-South
      const serviceZone = this.state.selectedProperty?.serviceZone || "Austin-South";
      const date = lower.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? (lower.includes("tomorrow") ? serviceDate(1) : serviceDate());

      const availResult = await this.checkAvailability(serviceType, serviceZone, date, undefined, correlationId);
      if (availResult.ok && availResult.data.slots.length > 0) {
        const slotDescriptions = availResult.data.slots
          .slice(0, 3)
          .map((s) => `${s.technicianName} at ${s.startAt.split("T")[1].substring(0, 5)}`)
          .join(", ");
        const reply = `I understand you have an ${serviceType} issue: "${cleanText}". We have openings on ${date} in ${serviceZone} with: ${slotDescriptions}. Would one of those work for you?`;
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      } else {
        const reply = `I noted your ${serviceType} issue, but no slots are available on ${date} in ${serviceZone}. Would you like me to check another date?`;
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      }
    }

    // 6. Reschedule request intent (e.g. "Reschedule wo_1001 to slot_305" or "Reschedule work order 1001")
    const reschedMatch = lower.match(/reschedule.*(wo_\d+|\d{4})/i);
    if (reschedMatch) {
      const woId = reschedMatch[1].startsWith("wo_") ? reschedMatch[1].toLowerCase() : `wo_${reschedMatch[1]}`;
      const targetSlot = this.state.availableSlots.find((s) => lower.includes(s.slotId.toLowerCase()));

      if (targetSlot) {
        const action = this.proposeReschedule(woId, targetSlot.slotId);
        const reply = `I can reschedule Work Order #${woId} to ${targetSlot.startAt.split("T")[1].substring(0, 5)} with technician ${targetSlot.technicianName}. Would you like me to confirm this reschedule?`;
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      } else {
        // Fetch current work order and check new availability
        const woResult = await this.getWorkOrder(woId, correlationId);
        if (woResult.ok && woResult.data.workOrder) {
          const wo = woResult.data.workOrder;
          const avail = await this.checkAvailability(wo.serviceType, "Austin-South", "2026-09-19", undefined, correlationId);
          if (avail.ok && avail.data.slots.length > 0) {
            const slotsText = avail.data.slots.slice(0, 3).map((s) => `${s.slotId} (${s.technicianName} at ${s.startAt.split("T")[1].substring(0, 5)})`).join(", ");
            const reply = `Work Order #${woId} is currently scheduled for ${wo.scheduledStart}. Available new slots for tomorrow include: ${slotsText}. Which slot would you prefer?`;
            this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
            return reply;
          }
        }
      }
    }

    // 7. Cancellation request intent (e.g. "Cancel wo_1001", "Cancel work order 1001")
    const cancelMatch = lower.match(/cancel.*(wo_\d+|\d{4})/i);
    if (cancelMatch) {
      const woId = cancelMatch[1].startsWith("wo_") ? cancelMatch[1].toLowerCase() : `wo_${cancelMatch[1]}`;
      const action = this.proposeCancellation(woId, cleanText);
      const reply = `Are you sure you want to cancel Work Order #${woId}? Please reply 'yes' or 'confirm' to execute the cancellation.`;
      this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
      return reply;
    }

    // 8. Work order retrieval (e.g. "Show work order wo_1001", "get work order 1001")
    const woMatch = cleanText.match(/wo_\d+/i) || cleanText.match(/(?:work\s*order|job)\s*#?\s*(\d{4})/i);
    if (woMatch) {
      const woId = woMatch[0].startsWith("wo_") ? woMatch[0].toLowerCase() : `wo_${woMatch[1]}`;
      const woResult = await this.getWorkOrder(woId, correlationId);
      if (woResult.ok && woResult.data.workOrder) {
        const wo = woResult.data.workOrder;
        const reply = `Work Order #${wo.id} is currently ${wo.status}. Service: ${wo.serviceType} ("${wo.issueSummary}"), scheduled for ${wo.scheduledStart}.`;
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      } else {
        const reply = `I could not find work order #${woId}. Please verify the order number.`;
        this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
        return reply;
      }
    }

    // Default conversational reply
    const reply = "I am DispatchAI, your Austin HVAC and plumbing assistant. You can tell me your service issue, provide your phone number, or ask for appointment availability.";
    this.state.history.push({ id: `msg_${Date.now()}_a`, role: "agent", content: reply, timestamp: new Date().toISOString() });
    return reply;
  }
}
