import { createHmac, timingSafeEqual } from "node:crypto";
import { WEEKDAYS, type BusinessConfig } from "@dispatchai/shared";

// Twilio signs each webhook: base64(HMAC-SHA1(authToken, fullUrl + every POST param as key+value, keys sorted)).
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((key) => key + params[key]).join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!signature || !authToken) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const escapeXml = (text: string) => text.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

// Say something, then listen for speech. actionOnEmptyResult: silence also comes back to us, so we can re-prompt.
export function gatherTwiml(say: string, action: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${escapeXml(action)}" method="POST" speechTimeout="auto" timeout="6" language="en-US" actionOnEmptyResult="true"><Say>${escapeXml(say)}</Say></Gather></Response>`;
}

export function dialTwiml(say: string, number: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(say)}</Say><Dial>${escapeXml(number)}</Dial></Response>`;
}

export function hangupTwiml(say: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(say)}</Say><Hangup/></Response>`;
}

// Is the business open right now, in its own time zone (used to decide: forward to staff, or take a call-back)?
export function isOpenNow(config: BusinessConfig, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: config.timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = WEEKDAYS[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"))];
  const hours = config.hours[day];
  const time = `${get("hour")}:${get("minute")}`;
  return !!hours && time >= hours.open && time < hours.close;
}

export const maskPhone = (phone: string) => phone.replace(/\d(?=\d{4})/g, "•");
