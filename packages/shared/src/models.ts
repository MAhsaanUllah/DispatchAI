import { z } from "zod";

export const ServiceTypeSchema = z.enum(["HVAC", "PLUMBING"]);
export type ServiceType = z.infer<typeof ServiceTypeSchema>;

export const CustomerSchema = z.object({
  id: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  createdAt: z.string()
});
export type Customer = z.infer<typeof CustomerSchema>;

export const PropertySchema = z.object({
  id: z.string(),
  customerId: z.string(),
  addressLine1: z.string().min(1),
  city: z.string(),
  state: z.literal("TX"),
  zipCode: z.string(),
  serviceZone: z.string()
});
export type Property = z.infer<typeof PropertySchema>;

export const TechnicianStatusSchema = z.enum(["ACTIVE", "OFF_DUTY"]);
export type TechnicianStatus = z.infer<typeof TechnicianStatusSchema>;

export const TechnicianSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  skills: z.array(ServiceTypeSchema),
  serviceZones: z.array(z.string()),
  status: TechnicianStatusSchema
});
export type Technician = z.infer<typeof TechnicianSchema>;

export const SlotStatusSchema = z.enum(["AVAILABLE", "RESERVED", "BOOKED"]);
export type SlotStatus = z.infer<typeof SlotStatusSchema>;

export const TechnicianSlotSchema = z.object({
  id: z.string(),
  technicianId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  status: SlotStatusSchema
});
export type TechnicianSlot = z.infer<typeof TechnicianSlotSchema>;

export const WorkOrderStatusSchema = z.enum([
  "NEW",
  "BOOKED",
  "DISPATCHED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED"
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusSchema>;

export const UrgencySchema = z.enum(["STANDARD", "HIGH"]);
export type Urgency = z.infer<typeof UrgencySchema>;

export const CreatedBySchema = z.enum(["VOICE_AGENT", "WEB_AGENT", "HUMAN"]);
export type CreatedBy = z.infer<typeof CreatedBySchema>;

export const WorkOrderSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  propertyId: z.string(),
  technicianId: z.string().optional(),
  serviceType: ServiceTypeSchema,
  issueSummary: z.string().min(1),
  urgency: UrgencySchema,
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  status: WorkOrderStatusSchema,
  createdBy: CreatedBySchema,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

export const CallOutcomeSchema = z.enum([
  "BOOKED",
  "NO_BOOKING",
  "FAILED",
  "ABANDONED"
]);
export type CallOutcome = z.infer<typeof CallOutcomeSchema>;

export const CallSchema = z.object({
  id: z.string(),
  elevenLabsConversationId: z.string(),
  customerId: z.string().optional(),
  workOrderId: z.string().optional(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  summary: z.string().optional(),
  outcome: CallOutcomeSchema.optional()
});
export type Call = z.infer<typeof CallSchema>;

export const IntegrationEventStatusSchema = z.enum([
  "STARTED",
  "SUCCEEDED",
  "FAILED"
]);
export type IntegrationEventStatus = z.infer<
  typeof IntegrationEventStatusSchema
>;

export const IntegrationEventSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  status: IntegrationEventStatusSchema,
  correlationId: z.string(),
  createdAt: z.string()
});
export type IntegrationEvent = z.infer<typeof IntegrationEventSchema>;

export const LocalNotificationSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  audience: z.enum(["CUSTOMER", "TECHNICIAN"]),
  recipientId: z.string(),
  eventType: z.enum(["BOOKED", "RESCHEDULED", "CANCELLED"]),
  message: z.string(),
  status: z.literal("PENDING_LOCAL"),
  createdAt: z.string()
});
export type LocalNotification = z.infer<typeof LocalNotificationSchema>;
