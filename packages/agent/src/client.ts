import {
  AvailableSlot,
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
  ToolResult
} from "@dispatchai/shared";
import { z } from "zod";

export interface N8nClientConfig {
  baseUrl: string;
  secret: string;
  request?: typeof fetch;
  directService?: any; // Optional local DispatchService fallback
  timeoutMs?: number;
  onRetry?: (attempt: number, maxRetries: number, error: string, correlationId: string) => void;
}

export class N8nClient {
  private baseUrl: string;
  private secret: string;
  private request: typeof fetch;
  private directService?: any;
  private timeoutMs: number;
  private onRetry?: (attempt: number, maxRetries: number, error: string, correlationId: string) => void;

  constructor(config: N8nClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.secret = config.secret;
    this.request = config.request || fetch;
    this.directService = config.directService;
    this.timeoutMs = config.timeoutMs || 5000;
    this.onRetry = config.onRetry;
  }

  private async callWebhook<TIn, TOut>(
    path: string,
    payload: TIn,
    correlationId: string,
    outputSchema: z.ZodType<TOut>,
    isRetryable = false,
    maxRetries = 3
  ): Promise<ToolResult<TOut>> {
    let attempts = 0;
    let lastErrorMsg = "";

    while (attempts < (isRetryable ? maxRetries : 1)) {
      attempts++;

      if (attempts > 1 && this.onRetry) {
        this.onRetry(attempts, maxRetries, lastErrorMsg, correlationId);
      }

      // If running with local direct service, execute in-memory
      if (this.directService) {
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

        if (result.ok) {
          const parsedOutput = outputSchema.safeParse(result.data);
          return parsedOutput.success
            ? result
            : toolFailure("INVALID_TOOL_RESPONSE", "Backend returned an invalid response", false, correlationId);
        }
        if (!result.error.retryable) {
          return result;
        }
        lastErrorMsg = result.error.message;
        continue;
      }

      // HTTP Webhook execution with timeout signal
      const url = `${this.baseUrl}${path}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.request(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-dispatch-secret": this.secret,
            "x-correlation-id": correlationId
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data: any = await response.json();
        const toolRes = data as ToolResult<TOut>;

        if (toolRes.ok) {
          const parsedOutput = outputSchema.safeParse(toolRes.data);
          return parsedOutput.success
            ? { ...toolRes, data: parsedOutput.data }
            : toolFailure("INVALID_TOOL_RESPONSE", "n8n returned an invalid response", false, correlationId);
        }
        if (!toolRes.error?.retryable) {
          return toolRes;
        }
        lastErrorMsg = toolRes.error?.message || "HTTP failure";
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastErrorMsg = err.name === "AbortError" ? `Request timed out after ${this.timeoutMs}ms` : err.message;
      }
    }

    return toolFailure(
      "N8N_COMMUNICATION_ERROR",
      `Failed to communicate with n8n backend after ${attempts} attempts: ${lastErrorMsg}`,
      true,
      correlationId
    );
  }

  // 1. find_customer
  public async findCustomer(
    input: FindCustomerInput,
    correlationId: string
  ): Promise<ToolResult<FindCustomerOutputData>> {
    const parsed = FindCustomerInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.errors.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }
    return this.callWebhook<FindCustomerInput, FindCustomerOutputData>(
      "/webhook/customer-lookup",
      parsed.data,
      correlationId,
      FindCustomerOutputDataSchema,
      true
    );
  }

  // 2. check_availability
  public async checkAvailability(
    input: CheckAvailabilityInput,
    correlationId: string
  ): Promise<ToolResult<CheckAvailabilityOutputData>> {
    const parsed = CheckAvailabilityInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.errors.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }
    return this.callWebhook<CheckAvailabilityInput, CheckAvailabilityOutputData>(
      "/webhook/check-availability",
      parsed.data,
      correlationId,
      CheckAvailabilityOutputDataSchema,
      true
    );
  }

  // 3. create_work_order
  public async createWorkOrder(
    input: CreateWorkOrderInput,
    correlationId: string
  ): Promise<ToolResult<CreateWorkOrderOutputData>> {
    const parsed = CreateWorkOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.errors.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }
    return this.callWebhook<CreateWorkOrderInput, CreateWorkOrderOutputData>(
      "/webhook/create-work-order",
      parsed.data,
      correlationId,
      CreateWorkOrderOutputDataSchema,
      false
    );
  }

  // 4. get_work_order
  public async getWorkOrder(
    input: GetWorkOrderInput,
    correlationId: string
  ): Promise<ToolResult<GetWorkOrderOutputData>> {
    const parsed = GetWorkOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.errors.map((e) => e.message).join(", "),
        false,
        correlationId
      );
    }
    return this.callWebhook<GetWorkOrderInput, GetWorkOrderOutputData>(
      "/webhook/get-work-order",
      parsed.data,
      correlationId,
      GetWorkOrderOutputDataSchema,
      true
    );
  }

  // 5. reschedule_work_order
  public async rescheduleWorkOrder(
    input: RescheduleWorkOrderInput,
    correlationId: string
  ): Promise<ToolResult<RescheduleWorkOrderOutputData>> {
    const parsed = RescheduleWorkOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.errors.map((e) => e.message).join(", "),
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

  // 6. cancel_work_order
  public async cancelWorkOrder(
    input: CancelWorkOrderInput,
    correlationId: string
  ): Promise<ToolResult<CancelWorkOrderOutputData>> {
    const parsed = CancelWorkOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFailure(
        "VALIDATION_ERROR",
        parsed.error.errors.map((e) => e.message).join(", "),
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
