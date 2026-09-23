import { z } from "zod";
import {
  CreatedBySchema,
  CustomerSchema,
  PropertySchema,
  ServiceTypeSchema,
  UrgencySchema,
  WorkOrderSchema
} from "./models.js";

// Common Response Envelope
export interface ToolSuccess<T> {
  ok: true;
  data: T;
  correlationId: string;
}

export interface ToolFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  correlationId: string;
}

export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export function toolSuccess<T>(data: T, correlationId: string): ToolSuccess<T> {
  return {
    ok: true,
    data,
    correlationId
  };
}

export function toolFailure(
  code: string,
  message: string,
  retryable: boolean,
  correlationId: string
): ToolFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable
    },
    correlationId
  };
}

// 1. find_customer
export const FindCustomerInputSchema = z.object({
  phone: z.string().min(7, "Phone number must be at least 7 characters")
});
export type FindCustomerInput = z.infer<typeof FindCustomerInputSchema>;

export const FindCustomerOutputDataSchema = z.object({
  customer: CustomerSchema.nullable(),
  properties: z.array(PropertySchema)
});
export type FindCustomerOutputData = z.infer<typeof FindCustomerOutputDataSchema>;

// 2. check_availability
export const PreferredWindowSchema = z.object({
  start: z.string(),
  end: z.string()
});
export type PreferredWindow = z.infer<typeof PreferredWindowSchema>;

export const CheckAvailabilityInputSchema = z.object({
  serviceType: ServiceTypeSchema,
  serviceZone: z.string().min(1, "serviceZone is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format"),
  preferredWindow: PreferredWindowSchema.optional()
});
export type CheckAvailabilityInput = z.infer<typeof CheckAvailabilityInputSchema>;

export const AvailableSlotSchema = z.object({
  slotId: z.string(),
  technicianId: z.string(),
  technicianName: z.string(),
  startAt: z.string(),
  endAt: z.string()
});
export type AvailableSlot = z.infer<typeof AvailableSlotSchema>;

export const CheckAvailabilityOutputDataSchema = z.object({
  slots: z.array(AvailableSlotSchema)
});
export type CheckAvailabilityOutputData = z.infer<
  typeof CheckAvailabilityOutputDataSchema
>;

// 3. create_work_order
export const CreateWorkOrderInputSchema = z.object({
  idempotencyKey: z.string().min(1, "idempotencyKey is required"),
  customerId: z.string().min(1, "customerId is required"),
  propertyId: z.string().min(1, "propertyId is required"),
  serviceType: ServiceTypeSchema,
  issueSummary: z.string().min(1, "issueSummary is required"),
  urgency: UrgencySchema,
  slotId: z.string().min(1, "slotId is required"),
  createdBy: CreatedBySchema
});
export type CreateWorkOrderInput = z.infer<typeof CreateWorkOrderInputSchema>;

export const CreateWorkOrderOutputDataSchema = z.object({
  workOrder: WorkOrderSchema
});
export type CreateWorkOrderOutputData = z.infer<
  typeof CreateWorkOrderOutputDataSchema
>;

// 4. get_work_order
export const GetWorkOrderInputSchema = z.object({
  workOrderId: z.string().min(1, "workOrderId is required")
});
export type GetWorkOrderInput = z.infer<typeof GetWorkOrderInputSchema>;

export const GetWorkOrderOutputDataSchema = z.object({
  workOrder: WorkOrderSchema.nullable()
});
export type GetWorkOrderOutputData = z.infer<typeof GetWorkOrderOutputDataSchema>;

// 5. reschedule_work_order
export const RescheduleWorkOrderInputSchema = z.object({
  idempotencyKey: z.string().min(1, "idempotencyKey is required"),
  workOrderId: z.string().min(1, "workOrderId is required"),
  newSlotId: z.string().min(1, "newSlotId is required")
});
export type RescheduleWorkOrderInput = z.infer<
  typeof RescheduleWorkOrderInputSchema
>;

export const RescheduleWorkOrderOutputDataSchema = z.object({
  workOrder: WorkOrderSchema,
  previousSlotId: z.string().optional()
});
export type RescheduleWorkOrderOutputData = z.infer<
  typeof RescheduleWorkOrderOutputDataSchema
>;

// 6. cancel_work_order
export const CancelWorkOrderInputSchema = z.object({
  idempotencyKey: z.string().min(1, "idempotencyKey is required"),
  workOrderId: z.string().min(1, "workOrderId is required"),
  reason: z.string().optional()
});
export type CancelWorkOrderInput = z.infer<typeof CancelWorkOrderInputSchema>;

export const CancelWorkOrderOutputDataSchema = z.object({
  workOrder: WorkOrderSchema
});
export type CancelWorkOrderOutputData = z.infer<
  typeof CancelWorkOrderOutputDataSchema
>;

// Tool Name Literals
export const ToolNames = {
  FIND_CUSTOMER: "find_customer",
  CHECK_AVAILABILITY: "check_availability",
  CREATE_WORK_ORDER: "create_work_order",
  GET_WORK_ORDER: "get_work_order",
  RESCHEDULE_WORK_ORDER: "reschedule_work_order",
  CANCEL_WORK_ORDER: "cancel_work_order"
} as const;

export type ToolName = (typeof ToolNames)[keyof typeof ToolNames];
