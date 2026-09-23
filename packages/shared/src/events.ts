import { z } from "zod";

export const AgentEventTypeSchema = z.enum([
  "TOOL_CALL_STARTED",
  "TOOL_CALL_COMPLETED",
  "TOOL_CALL_FAILED",
  "STATE_UPDATED",
  "WORK_ORDER_CREATED",
  "WORK_ORDER_RESCHEDULED",
  "WORK_ORDER_CANCELLED",
  "CONFIRMATION_REQUIRED",
  "RETRY_STARTED",
  "ERROR"
]);
export type AgentEventType = z.infer<typeof AgentEventTypeSchema>;

export const AgentEventSchema = z.object({
  id: z.string(),
  type: AgentEventTypeSchema,
  timestamp: z.string(),
  correlationId: z.string(),
  toolName: z.string().optional(),
  payload: z.record(z.any()).optional(),
  message: z.string().optional()
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;
