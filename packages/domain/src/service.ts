import {
  AvailableSlot,
  CancelWorkOrderInput,
  CancelWorkOrderInputSchema,
  CancelWorkOrderOutputData,
  CheckAvailabilityInput,
  CheckAvailabilityInputSchema,
  CheckAvailabilityOutputData,
  CreateWorkOrderInput,
  CreateWorkOrderInputSchema,
  CreateWorkOrderOutputData,
  FindCustomerInput,
  FindCustomerInputSchema,
  FindCustomerOutputData,
  GetWorkOrderInput,
  GetWorkOrderInputSchema,
  GetWorkOrderOutputData,
  RescheduleWorkOrderInput,
  RescheduleWorkOrderInputSchema,
  RescheduleWorkOrderOutputData,
  toolFailure,
  ToolResult,
  toolSuccess,
  WorkOrder,
  LocalNotification
} from "@dispatchai/shared";
import { randomUUID } from "node:crypto";
import { DispatchStore } from "./store.js";

export class DispatchService {
  private store: DispatchStore;

  constructor(store?: DispatchStore) {
    this.store = store ?? new DispatchStore();
  }

  public getStore(): DispatchStore {
    return this.store;
  }

  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private idempotencyRecord<T>(operation: string, key: string, input: unknown, data?: T): T | "CONFLICT" | undefined {
    const storeKey = `${operation}:${key}`;
    const request = JSON.stringify(input);
    const cached = this.store.idempotencyRecords.get(storeKey) as { request: string; data: T } | undefined;
    if (cached) return cached.request === request ? structuredClone(cached.data) : "CONFLICT";
    if (data !== undefined) this.store.idempotencyRecords.set(storeKey, { request, data: structuredClone(data) });
    return undefined;
  }

  private queueNotifications(workOrder: WorkOrder, eventType: LocalNotification["eventType"], now: string): void {
    for (const [audience, recipientId] of [
      ["CUSTOMER", workOrder.customerId],
      ["TECHNICIAN", workOrder.technicianId]
    ] as const) {
      if (!recipientId) continue;
      this.store.notifications.push({
        id: `notice_${randomUUID()}`,
        workOrderId: workOrder.id,
        audience,
        recipientId,
        eventType,
        message: `Work order ${workOrder.id} ${eventType.toLowerCase()} for ${workOrder.scheduledStart ?? "an unscheduled time"}.`,
        status: "PENDING_LOCAL",
        createdAt: now
      });
    }
  }

  // 1. find_customer
  public findCustomer(
    rawInput: unknown,
    correlationId: string = this.generateCorrelationId()
  ): ToolResult<FindCustomerOutputData> {
    const parsed = FindCustomerInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return toolFailure(
        "INVALID_INPUT",
        parsed.error.errors.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }

    const { phone } = parsed.data;
    // Normalize phone (remove non-digits)
    const cleanPhone = phone.replace(/\D/g, "");

    let foundCustomer = null;
    for (const customer of this.store.customers.values()) {
      if (customer.phone.replace(/\D/g, "") === cleanPhone) {
        foundCustomer = customer;
        break;
      }
    }

    if (!foundCustomer) {
      return toolSuccess(
        {
          customer: null,
          properties: []
        },
        correlationId
      );
    }

    const properties = Array.from(this.store.properties.values()).filter(
      (p) => p.customerId === foundCustomer!.id
    );

    return toolSuccess(
      {
        customer: foundCustomer,
        properties
      },
      correlationId
    );
  }

  // 2. check_availability
  public checkAvailability(
    rawInput: unknown,
    correlationId: string = this.generateCorrelationId()
  ): ToolResult<CheckAvailabilityOutputData> {
    const parsed = CheckAvailabilityInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return toolFailure(
        "INVALID_INPUT",
        parsed.error.errors.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }

    const { serviceType, serviceZone, date, preferredWindow } = parsed.data;
    this.store.addUpcomingSlots();

    // Find active technicians matching serviceType and serviceZone
    const eligibleTechs = Array.from(this.store.technicians.values()).filter(
      (t) =>
        t.status === "ACTIVE" &&
        t.skills.includes(serviceType) &&
        t.serviceZones.includes(serviceZone)
    );

    const eligibleTechMap = new Map(eligibleTechs.map((t) => [t.id, t]));
    const availableSlots: AvailableSlot[] = [];

    for (const slot of this.store.slots.values()) {
      if (slot.status !== "AVAILABLE") continue;
      if (!slot.startAt.startsWith(date)) continue;

      const tech = eligibleTechMap.get(slot.technicianId);
      if (!tech) continue;

      // Check preferred window if specified
      if (preferredWindow) {
        const slotStartTime = slot.startAt.split("T")[1];
        const slotEndTime = slot.endAt.split("T")[1];
        if (
          slotStartTime < preferredWindow.start ||
          slotEndTime > preferredWindow.end
        ) {
          continue;
        }
      }

      availableSlots.push({
        slotId: slot.id,
        technicianId: tech.id,
        technicianName: tech.name,
        startAt: slot.startAt,
        endAt: slot.endAt
      });
    }

    // Sort chronologically
    availableSlots.sort((a, b) => a.startAt.localeCompare(b.startAt));

    return toolSuccess({ slots: availableSlots }, correlationId);
  }

  // 3. create_work_order
  public createWorkOrder(
    rawInput: unknown,
    correlationId: string = this.generateCorrelationId()
  ): ToolResult<CreateWorkOrderOutputData> {
    const parsed = CreateWorkOrderInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return toolFailure(
        "INVALID_INPUT",
        parsed.error.errors.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }

    const input = parsed.data;

    // Idempotency check
    const cached = this.idempotencyRecord<CreateWorkOrderOutputData>("create", input.idempotencyKey, input);
    if (cached === "CONFLICT") {
      return toolFailure("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different request", false, correlationId);
    }
    if (cached) {
      return toolSuccess(cached, correlationId);
    }

    // Validate customer
    const customer = this.store.customers.get(input.customerId);
    if (!customer) {
      return toolFailure("CUSTOMER_NOT_FOUND", "Customer does not exist", false, correlationId);
    }

    // Validate property
    const property = this.store.properties.get(input.propertyId);
    if (!property || property.customerId !== customer.id) {
      return toolFailure("PROPERTY_NOT_FOUND", "Property does not exist or belong to customer", false, correlationId);
    }

    // Validate slot atomically
    const slot = this.store.slots.get(input.slotId);
    if (!slot) {
      return toolFailure("SLOT_NOT_FOUND", "Requested slot does not exist", false, correlationId);
    }

    if (slot.status !== "AVAILABLE") {
      return toolFailure(
        "SLOT_UNAVAILABLE",
        "The selected appointment slot is no longer available. Please check availability again.",
        false,
        correlationId
      );
    }

    // Validate technician qualification and zone
    const tech = this.store.technicians.get(slot.technicianId);
    if (!tech || tech.status !== "ACTIVE" || !tech.skills.includes(input.serviceType) || !tech.serviceZones.includes(property.serviceZone)) {
      return toolFailure(
        "TECHNICIAN_NOT_QUALIFIED",
        "Assigned technician is not available for this service or zone",
        false,
        correlationId
      );
    }

    // Reserve / Book slot
    slot.status = "BOOKED";

    const workOrderId = `wo_${Date.now()}`;
    const now = new Date().toISOString();

    const workOrder: WorkOrder = {
      id: workOrderId,
      customerId: input.customerId,
      propertyId: input.propertyId,
      technicianId: tech.id,
      serviceType: input.serviceType,
      issueSummary: input.issueSummary,
      urgency: input.urgency,
      scheduledStart: slot.startAt,
      scheduledEnd: slot.endAt,
      status: "BOOKED",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now
    };

    this.store.workOrders.set(workOrderId, workOrder);

    const resultData: CreateWorkOrderOutputData = { workOrder };
    this.idempotencyRecord("create", input.idempotencyKey, input, resultData);
    this.queueNotifications(workOrder, "BOOKED", now);

    this.store.recordEvent({
      id: `evt_${Date.now()}`,
      eventType: "WORK_ORDER_CREATED",
      entityType: "WorkOrder",
      entityId: workOrderId,
      status: "SUCCEEDED",
      correlationId,
      createdAt: now
    });

    return toolSuccess(resultData, correlationId);
  }

  // 4. get_work_order
  public getWorkOrder(
    rawInput: unknown,
    correlationId: string = this.generateCorrelationId()
  ): ToolResult<GetWorkOrderOutputData> {
    const parsed = GetWorkOrderInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return toolFailure(
        "INVALID_INPUT",
        parsed.error.errors.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }

    const { workOrderId } = parsed.data;
    const workOrder = this.store.workOrders.get(workOrderId) || null;

    return toolSuccess({ workOrder }, correlationId);
  }

  // 5. reschedule_work_order
  public rescheduleWorkOrder(
    rawInput: unknown,
    correlationId: string = this.generateCorrelationId()
  ): ToolResult<RescheduleWorkOrderOutputData> {
    const parsed = RescheduleWorkOrderInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return toolFailure(
        "INVALID_INPUT",
        parsed.error.errors.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }

    const input = parsed.data;

    // Idempotency check
    const cached = this.idempotencyRecord<RescheduleWorkOrderOutputData>("reschedule", input.idempotencyKey, input);
    if (cached === "CONFLICT") {
      return toolFailure("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different request", false, correlationId);
    }
    if (cached) {
      return toolSuccess(cached, correlationId);
    }

    const workOrder = this.store.workOrders.get(input.workOrderId);
    if (!workOrder) {
      return toolFailure("WORK_ORDER_NOT_FOUND", "Work order not found", false, correlationId);
    }

    if (workOrder.status === "CANCELLED" || workOrder.status === "COMPLETED") {
      return toolFailure(
        "WORK_ORDER_LOCKED",
        `Cannot reschedule work order in ${workOrder.status} status`,
        false,
        correlationId
      );
    }

    const newSlot = this.store.slots.get(input.newSlotId);
    if (!newSlot) {
      return toolFailure("SLOT_NOT_FOUND", "New slot does not exist", false, correlationId);
    }

    if (newSlot.status !== "AVAILABLE") {
      return toolFailure(
        "SLOT_UNAVAILABLE",
        "The target slot is no longer available. Please check availability again.",
        false,
        correlationId
      );
    }

    const property = this.store.properties.get(workOrder.propertyId);
    const tech = this.store.technicians.get(newSlot.technicianId);
    if (!property || !tech || tech.status !== "ACTIVE" || !tech.skills.includes(workOrder.serviceType) || !tech.serviceZones.includes(property.serviceZone)) {
      return toolFailure(
        "TECHNICIAN_NOT_QUALIFIED",
        "Target technician does not match service type or zone",
        false,
        correlationId
      );
    }

    // Release old slot if found
    let previousSlotId: string | undefined;
    for (const slot of this.store.slots.values()) {
      if (
        slot.technicianId === workOrder.technicianId &&
        slot.startAt === workOrder.scheduledStart &&
        slot.status === "BOOKED"
      ) {
        slot.status = "AVAILABLE";
        previousSlotId = slot.id;
        break;
      }
    }

    // Book new slot
    newSlot.status = "BOOKED";

    // Update work order
    const now = new Date().toISOString();
    workOrder.scheduledStart = newSlot.startAt;
    workOrder.scheduledEnd = newSlot.endAt;
    workOrder.technicianId = tech.id;
    workOrder.status = "BOOKED";
    workOrder.updatedAt = now;

    const resultData: RescheduleWorkOrderOutputData = {
      workOrder,
      previousSlotId
    };

    this.idempotencyRecord("reschedule", input.idempotencyKey, input, resultData);
    this.queueNotifications(workOrder, "RESCHEDULED", now);

    this.store.recordEvent({
      id: `evt_${Date.now()}`,
      eventType: "WORK_ORDER_RESCHEDULED",
      entityType: "WorkOrder",
      entityId: workOrder.id,
      status: "SUCCEEDED",
      correlationId,
      createdAt: now
    });

    return toolSuccess(resultData, correlationId);
  }

  // 6. cancel_work_order
  public cancelWorkOrder(
    rawInput: unknown,
    correlationId: string = this.generateCorrelationId()
  ): ToolResult<CancelWorkOrderOutputData> {
    const parsed = CancelWorkOrderInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return toolFailure(
        "INVALID_INPUT",
        parsed.error.errors.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }

    const input = parsed.data;

    // Idempotency check
    const cached = this.idempotencyRecord<CancelWorkOrderOutputData>("cancel", input.idempotencyKey, input);
    if (cached === "CONFLICT") {
      return toolFailure("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different request", false, correlationId);
    }
    if (cached) {
      return toolSuccess(cached, correlationId);
    }

    const workOrder = this.store.workOrders.get(input.workOrderId);
    if (!workOrder) {
      return toolFailure("WORK_ORDER_NOT_FOUND", "Work order not found", false, correlationId);
    }

    // If already cancelled, return existing (idempotent)
    if (workOrder.status === "CANCELLED") {
      const resultData: CancelWorkOrderOutputData = { workOrder };
      this.idempotencyRecord("cancel", input.idempotencyKey, input, resultData);
      this.store.persist();
      return toolSuccess(resultData, correlationId);
    }

    if (workOrder.status === "COMPLETED") {
      return toolFailure(
        "WORK_ORDER_COMPLETED",
        "Cannot cancel a completed work order",
        false,
        correlationId
      );
    }

    // Release slot back to AVAILABLE
    for (const slot of this.store.slots.values()) {
      if (
        slot.technicianId === workOrder.technicianId &&
        slot.startAt === workOrder.scheduledStart &&
        slot.status === "BOOKED"
      ) {
        slot.status = "AVAILABLE";
        break;
      }
    }

    const now = new Date().toISOString();
    workOrder.status = "CANCELLED";
    workOrder.updatedAt = now;

    const resultData: CancelWorkOrderOutputData = { workOrder };
    this.idempotencyRecord("cancel", input.idempotencyKey, input, resultData);
    this.queueNotifications(workOrder, "CANCELLED", now);

    this.store.recordEvent({
      id: `evt_${Date.now()}`,
      eventType: "WORK_ORDER_CANCELLED",
      entityType: "WorkOrder",
      entityId: workOrder.id,
      status: "SUCCEEDED",
      correlationId,
      createdAt: now
    });

    return toolSuccess(resultData, correlationId);
  }
}
