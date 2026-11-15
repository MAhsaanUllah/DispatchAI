import { hoursText, type BusinessConfig, type WorkOrder } from "@dispatchai/shared";

// How the agent sounds. The booking rules and the yes-confirmation never change with the tone; only the
// wording of the lines that frame the conversation does. "friendly" is the wording the agent always had.
export type Tone = "friendly" | "formal" | "brief";

const when = (workOrder: WorkOrder) => workOrder.scheduledStart ?? "a time we will confirm";

export function confirmationLine(tone: Tone, kind: "BOOK" | "RESCHEDULE" | "CANCEL", workOrder: WorkOrder, note: string): string {
  const id = workOrder.id;
  const tech = workOrder.technicianId;
  if (tone === "formal") {
    if (kind === "RESCHEDULE") return `Your appointment has been rescheduled. Work order #${id} is now set for ${when(workOrder)} with technician ${tech}. ${note}`;
    if (kind === "CANCEL") return `Your appointment has been cancelled. Work order #${id} is closed. ${note}`;
    return `Your appointment is confirmed. Work order #${id} is booked with technician ${tech} for ${when(workOrder)}. ${note}`;
  }
  if (tone === "brief") {
    if (kind === "RESCHEDULE") return `Rescheduled. Work order #${id}: ${when(workOrder)}, technician ${tech}. ${note}`;
    if (kind === "CANCEL") return `Cancelled. Work order #${id}. ${note}`;
    return `Booked. Work order #${id}: ${when(workOrder)}, technician ${tech}. ${note}`;
  }
  if (kind === "RESCHEDULE") return `I have confirmed the reschedule: Work order #${id} has been rescheduled to ${workOrder.scheduledStart} with technician ${tech}. ${note}`;
  if (kind === "CANCEL") return `I have confirmed the cancellation: Work order #${id} has been cancelled. ${note}`;
  return `I have confirmed your appointment! Work order #${id} is booked with technician ${tech} for ${workOrder.scheduledStart}. ${note}`;
}

// When the caller asks for a person. (The emergency line is never reworded.)
export function handoffLine(tone: Tone): string {
  if (tone === "formal") return "I have requested that a member of our staff contact you. Please let me know if there is anything I should pass on.";
  if (tone === "brief") return "A team member will call you back. Anything to pass on?";
  return "I have asked a team member to call you back. Is there anything I can note for them?";
}

// Plain questions a caller asks that are not part of a booking: who is this, when are you open, where do you work,
// what do you do. Answers come only from what the owner saved, and the agent never hides that it is an AI.
export function answerAbout(text: string, config: BusinessConfig): string | null {
  const lower = text.toLowerCase();
  if (/\b(who are you|who is this|your name|are you (a |an )?(bot|robot|human|real|ai|person))\b/.test(lower)) {
    const me = config.agentName ? `I am ${config.agentName}, ` : "I am ";
    return `${me}the AI booking assistant for ${config.name}. I can book, move or cancel an appointment, or ask a team member to call you back.`;
  }
  if (/\b(open|opening|closing|close|hours|timings?|timing|working hours|what time)\b/.test(lower)) {
    return `We are open ${hoursText(config.hours)} (${config.timeZone}). Appointments are ${config.slotMinutes} minutes long.`;
  }
  if (/\b(where|areas?|location|address|cover|coverage|come to|travel)\b/.test(lower)) {
    return config.kind === "instore"
      ? `You can find us at ${config.serviceZones[0]}.`
      : `We come to customers in: ${config.serviceZones.join(", ")}.`;
  }
  if (/\b(services?|what do you (do|offer)|offer|prices?|cost|how much|fees?)\b/.test(lower)) {
    return `We offer: ${config.services.map((service) => service.name).join(", ")}. ${config.services[0]?.priceNote ?? ""}`.trim();
  }
  return null;
}
