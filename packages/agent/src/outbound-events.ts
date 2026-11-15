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

// Posts one signed event body. Never throws, so a booking never fails because n8n is down; retries live in outbox.ts.
export async function postSignedEvent(url: string, secret: string, type: string, body: string, timeoutMs = 5000): Promise<{ ok: boolean; error?: string }> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dispatchai-event": type,
        "x-dispatchai-timestamp": timestamp,
        "x-dispatchai-signature": await signEvent(body, timestamp, secret)
      },
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
    return response.ok ? { ok: true } : { ok: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? "Timed out" : "Could not connect" };
  }
}

export async function sendBookingEvent(url: string, secret: string, event: BookingEvent, timeoutMs = 5000): Promise<boolean> {
  return (await postSignedEvent(url, secret, event.type, JSON.stringify(event), timeoutMs)).ok;
}
