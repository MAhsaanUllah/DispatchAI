import type { DispatchStore } from "./store.js";

// Email is opt-in. Demo addresses are never sent to a provider.
export async function deliverBookingEmails(store: DispatchStore, workOrderId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return;

  for (const notice of store.notifications) {
    if (notice.workOrderId !== workOrderId || notice.channel !== "EMAIL" || notice.status !== "PENDING_LOCAL") continue;
    const to = notice.recipientAddress;
    if (!to || to.toLowerCase().endsWith("@example.com")) continue;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": notice.id
        },
        body: JSON.stringify({ from, to: [to], subject: notice.subject, text: notice.message })
      });
      if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
      const result = await response.json() as { id?: string };
      notice.status = "SENT";
      notice.providerId = result.id;
    } catch {
      notice.status = "FAILED";
    }
    store.persist();
  }
}
