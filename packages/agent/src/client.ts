import {
  CancelWorkOrderInput,
  CancelWorkOrderInputSchema,
  CancelWorkOrderOutputData,
  CancelWorkOrderOutputDataSchema,
  CheckAvailabilityInput,
  CheckAvailabilityInputSchema,
  CheckAvailabilityOutputData,
  CheckAvailabilityOutputDataSchema,
  CreateWorkOrderInput,
  CreateWorkOrderInputSchema,
  CreateWorkOrderOutputData,
  CreateWorkOrderOutputDataSchema,
  FindCustomerInput,
  FindCustomerInputSchema,
  FindCustomerOutputData,
  FindCustomerOutputDataSchema,
  GetWorkOrderInput,
  GetWorkOrderInputSchema,
  GetWorkOrderOutputData,
  GetWorkOrderOutputDataSchema,
  RescheduleWorkOrderInput,
  RescheduleWorkOrderInputSchema,
  RescheduleWorkOrderOutputData,
  RescheduleWorkOrderOutputDataSchema,
  toolFailure,
  ToolResult,
  WorkOrder,
  Customer,
  Property
} from "@dispatchai/shared";
import { z } from "zod";

export interface N8nClientConfig {
  directService: any; // Local DispatchService (single writer). n8n/HTTP path removed.
  onMutation?: (kind: MutationKind, workOrder: WorkOrder) => Promise<void>; // Side effects after a direct create/reschedule/cancel
}

export type MutationKind = "created" | "rescheduled" | "cancelled";
const MUTATION_PATHS = new Map<string, MutationKind>([
  ["/webhook/create-work-order", "created"],
  ["/webhook/reschedule-work-order", "rescheduled"],
  ["/webhook/cancel-work-order", "cancelled"]
]);

export class N8nClient {
  private directService: any;
  private onMutation?: (kind: MutationKind, workOrder: WorkOrder) => Promise<void>;

  constructor(config: N8nClientConfig) {
    this.directService = config.directService;
    this.onMutation = config.onMutation;
  }

  private async callWebhook<TIn, TOut>(
    path: string,
    payload: TIn,
    correlationId: string,
    outputSchema: z.ZodType<TOut>
  ): Promise<ToolResult<TOut>> {
    // Direct in-process service only; the n8n/HTTP path (Cloudflare, v1.1) was removed.
    let result: ToolResult<TOut>;
    switch (path) {
      case "/webhook/customer-lookup":
        result = this.directService.findCustomer(payload, correlationId);
        break;
      case "/webhook/check-availability":
        result = this.directService.checkAvailability(payload, correlationId);
        break;
      case "/webhook/create-work-order":
        result = this.directService.createWorkOrder(payload, correlationId);
        break;
      case "/webhook/get-work-order":
        result = this.directService.getWorkOrder(payload, correlationId);
        break;
      case "/webhook/reschedule-work-order":
        result = this.directService.rescheduleWorkOrder(payload, correlationId);
        break;
      case "/webhook/cancel-work-order":
        result = this.directService.cancelWorkOrder(payload, correlationId);
        break;
      default:
        result = toolFailure("UNKNOWN_ENDPOINT", `Unknown endpoint ${path}`, false, correlationId);
    }

    const kind = MUTATION_PATHS.get(path);
    if (result.ok && kind) {
      await this.onMutation?.(kind, (result.data as { workOrder: WorkOrder }).workOrder);
    }
    if (result.ok) {
      const parsedOutput = outputSchema.safeParse(result.data);
      return parsedOutput.success
        ? result
        : toolFailure("INVALID_TOOL_RESPONSE", "Backend returned an invalid response", false, correlationId);
    }
    return result;
  }

  // 1. find_customer (shortcut: only the in-process service can create callers)
  public async createCaller(input: { name: string; phone: string; addressLine1?: string; serviceZone?: string }, correlationId: string): Promise<ToolResult<{ customer: Customer; property: Property | null }>> {
    if (!this.directService) return toolFailure("UNSUPPORTED", "Creating callers needs the local booking service", false, correlationId);
    return this.directService.createCaller(input, correlationId);
  }

  // 2. find_customer
  public async findCustomer(
    input: FindCustomerInput,
    correlationId: string
  ): Promise<ToolResult<FindCustomerOutputData>> {
    const parsed = FindCustomerInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.issues.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }
    return this.callWebhook<FindCustomerInput, FindCustomerOutputData>(
      "/webhook/customer-lookup",
      parsed.data,
      correlationId,
      FindCustomerOutputDataSchema
    );
  }

  // 3. check_availability
  public async checkAvailability(
    input: CheckAvailabilityInput,
    correlationId: string
  ): Promise<ToolResult<CheckAvailabilityOutputData>> {
    const parsed = CheckAvailabilityInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.issues.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }
    return this.callWebhook<CheckAvailabilityInput, CheckAvailabilityOutputData>(
      "/webhook/check-availability",
      parsed.data,
      correlationId,
      CheckAvailabilityOutputDataSchema
    );
  }

  // 4. create_work_order
  public async createWorkOrder(
    input: CreateWorkOrderInput,
    correlationId: string
  ): Promise<ToolResult<CreateWorkOrderOutputData>> {
    const parsed = CreateWorkOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.issues.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }
    return this.callWebhook<CreateWorkOrderInput, CreateWorkOrderOutputData>(
      "/webhook/create-work-order",
      parsed.data,
      correlationId,
      CreateWorkOrderOutputDataSchema
    );
  }

  // 5. get_work_order
  public async getWorkOrder(
    input: GetWorkOrderInput,
    correlationId: string
  ): Promise<ToolResult<GetWorkOrderOutputData>> {
    const parsed = GetWorkOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.issues.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }
    return this.callWebhook<GetWorkOrderInput, GetWorkOrderOutputData>(
      "/webhook/get-work-order",
      parsed.data,
      correlationId,
      GetWorkOrderOutputDataSchema
    );
  }

  // 6. reschedule_work_order
  public async rescheduleWorkOrder(
    input: RescheduleWorkOrderInput,
    correlationId: string
  ): Promise<ToolResult<RescheduleWorkOrderOutputData>> {
    const parsed = RescheduleWorkOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.issues.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }
    return this.callWebhook<RescheduleWorkOrderInput, RescheduleWorkOrderOutputData>(
      "/webhook/reschedule-work-order",
      parsed.data,
      correlationId,
      RescheduleWorkOrderOutputDataSchema
    );
  }

  // 7. cancel_work_order
  public async cancelWorkOrder(
    input: CancelWorkOrderInput,
    correlationId: string
  ): Promise<ToolResult<CancelWorkOrderOutputData>> {
    const parsed = CancelWorkOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.issues.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }
    return this.callWebhook<CancelWorkOrderInput, CancelWorkOrderOutputData>(
      "/webhook/cancel-work-order",
      parsed.data,
      correlationId,
      CancelWorkOrderOutputDataSchema
    );
  }
}
