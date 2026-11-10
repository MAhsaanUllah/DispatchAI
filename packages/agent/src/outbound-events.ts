import { signEvent, type WorkOrder } from "@dispatchai/shared";

export type BookingEventType = "booking.created" | "booking.rescheduled" | "booking.cancelled";

export type BookingEvent = {
  eventId: string;
  type: BookingEventType;
  occurredAt: string;
  data: {
    bookingId: string;
    customerRef: string;
    service: string;
    status: string;
    slotStart?: string;
    slotEnd?: string;
    timezone: string;
  };
};

// IDs only by default (ADR-15): no name, phone, address or free-text issue leaves the app.
export function buildBookingEvent(type: BookingEventType, workOrder: WorkOrder, timezone: string): BookingEvent {
  return {
    eventId: `evt_${crypto.randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    data: {
      bookingId: workOrder.id,
      customerRef: workOrder.customerId,
      service: workOrder.serviceType,
      status: workOrder.status,
      slotStart: workOrder.scheduledStart,
      slotEnd: workOrder.scheduledEnd,
      timezone
    }
  };
}

// shortcut: one attempt, no outbox/retry/dead-letter; PR 12 adds those. Never throws, so a booking never fails because n8n is down.
export async function sendBookingEvent(url: string, secret: string, event: BookingEvent, timeoutMs = 5000): Promise<boolean> {
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dispatchai-event": event.type,
        "x-dispatchai-timestamp": timestamp,
        "x-dispatchai-signature": await signEvent(body, timestamp, secret)
      },
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
    return response.ok;
  } catch {
    return false;
  }
}
