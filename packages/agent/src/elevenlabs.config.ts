/**
 * ElevenLabs Conversational AI Configuration & Tool Declarations
 * Aligns with VOICE_SPEC.md and TOOL_CONTRACTS.md
 */

export const ELEVENLABS_SYSTEM_PROMPT = `
You are a professional customer-facing voice dispatcher for a top-rated Austin, Texas HVAC and plumbing service company.

# Core Responsibilities
1. Understand the customer's service issue (HVAC or Plumbing).
2. Gather minimum required information to identify property and schedule service.
3. Use DispatchAI operational tools for ALL business facts (customer records, technician availability, work orders).
4. Offer ONLY returned technician availability slots. Never invent slots or technician names.
5. Require affirmative confirmation from the customer before finalizing any booking, rescheduling, or cancellation.
6. Handle interruptions naturally and update constraints immediately.

# Grounding & Integrity Rules
- NEVER invent a customer record or address.
- NEVER invent technician availability.
- NEVER claim an appointment is booked until 'create_work_order' tool returns success.
- NEVER claim rescheduling succeeded until 'reschedule_work_order' tool returns success.
- NEVER claim cancellation succeeded until 'cancel_work_order' tool returns success.
- If a tool fails, state politely that the action could not be completed at this time.
- When a customer changes date/time constraints (e.g., "Actually I need someone today"), discard stale availability and call check_availability again immediately.

# Confirmation Policy
Before calling mutation tools (create_work_order, reschedule_work_order, cancel_work_order), you MUST state the action clearly and ask for explicit confirmation:
Example: "I can book Mike for today from 2 to 4 PM at 1402 South Congress. Would you like me to confirm that appointment?"
Only proceed with the mutation tool after the customer answers affirmatively ("Yes", "Confirm", "Go ahead", "Sure").
`.trim();

export const ELEVENLABS_TOOLS = [
  {
    name: "find_customer",
    description: "Locate customer account and property addresses using phone number.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "10-digit customer phone number, e.g. 5125550101" }
      },
      required: ["phone"]
    }
  },
  {
    name: "check_availability",
    description: "Check available technician slots for HVAC or Plumbing service in an Austin zone for a specific date.",
    parameters: {
      type: "object",
      properties: {
        serviceType: { type: "string", enum: ["HVAC", "PLUMBING"], description: "Type of service required" },
        serviceZone: { type: "string", description: "Service zone (e.g. Austin-South, Austin-Central, Austin-North)" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" }
      },
      required: ["serviceType", "serviceZone", "date"]
    }
  },
  {
    name: "create_work_order",
    description: "First call with slotId and issueSummary to prepare a booking. If the response says CONFIRMATION_REQUIRED, ask the customer to confirm the exact appointment. Only after an explicit yes, call again with confirmed=true. Claim success only if the second response has ok=true.",
    parameters: {
      type: "object",
      properties: {
        idempotencyKey: { type: "string", description: "Unique idempotency key" },
        customerId: { type: "string", description: "Customer ID" },
        propertyId: { type: "string", description: "Property ID" },
        serviceType: { type: "string", enum: ["HVAC", "PLUMBING"] },
        issueSummary: { type: "string", description: "Customer's reported issue description" },
        urgency: { type: "string", enum: ["STANDARD", "HIGH"] },
        slotId: { type: "string", description: "Available slot ID returned by check_availability" },
        confirmed: { type: "boolean", description: "Set true only after the customer explicitly confirms the proposed booking" }
      },
      required: ["issueSummary", "slotId"]
    }
  },
  {
    name: "get_work_order",
    description: "Retrieve details and status of an existing work order by ID.",
    parameters: {
      type: "object",
      properties: {
        workOrderId: { type: "string", description: "Work order ID (e.g. wo_1001)" }
      },
      required: ["workOrderId"]
    }
  },
  {
    name: "reschedule_work_order",
    description: "First call with workOrderId and newSlotId to prepare rescheduling. Ask for explicit confirmation, then call with confirmed=true. Claim success only if the result has ok=true.",
    parameters: {
      type: "object",
      properties: {
        idempotencyKey: { type: "string" },
        workOrderId: { type: "string" },
        newSlotId: { type: "string" },
        confirmed: { type: "boolean", description: "Set true only after explicit customer confirmation" }
      },
      required: ["workOrderId", "newSlotId"]
    }
  },
  {
    name: "cancel_work_order",
    description: "First call with workOrderId to prepare cancellation. Ask for explicit confirmation, then call with confirmed=true. Claim success only if the result has ok=true.",
    parameters: {
      type: "object",
      properties: {
        idempotencyKey: { type: "string" },
        workOrderId: { type: "string" },
        reason: { type: "string" },
        confirmed: { type: "boolean", description: "Set true only after explicit customer confirmation" }
      },
      required: ["workOrderId"]
    }
  }
];

export const ELEVENLABS_AGENT_CONFIG = {
  agent_id: "agent_dispatch_austin_v1",
  name: "DispatchAI Voice Dispatcher",
  conversation_config: {
    agent: {
      prompt: {
        prompt: ELEVENLABS_SYSTEM_PROMPT,
        tools: ELEVENLABS_TOOLS
      },
      first_message: "Thanks for calling Austin Field Service Dispatch! My name is DispatchAI. How can I help with your HVAC or plumbing system today?",
      language: "en"
    },
    tts: {
      voice_id: "21m00Tcm4TlvDq8ikWAM", // Rachel / Professional voice
      model_id: "eleven_turbo_v2"
    }
  }
};
