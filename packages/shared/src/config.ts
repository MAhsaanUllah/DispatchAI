import { z } from "zod";

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const BusinessServiceSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "Service id must be UPPER_SNAKE_CASE"),
  name: z.string().min(1),
  description: z.string().min(1),
  priceNote: z.string().min(1),
  // Lowercase words that signal this service in caller text. When several services match, the later one wins.
  keywords: z.array(z.string().min(1)).min(1)
});
export type BusinessService = z.infer<typeof BusinessServiceSchema>;

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");
// null = closed that day.
const DayHoursSchema = z.object({ open: TimeSchema, close: TimeSchema })
  .refine((hours) => hours.open < hours.close, "Closing time must be after opening time")
  .nullable();
export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const nineToFive = { open: "09:00", close: "17:00" };
export const DEFAULT_HOURS = { sun: null, mon: nineToFive, tue: nineToFive, wed: nineToFive, thu: nineToFive, fri: nineToFive, sat: null };

// One deployment = one business. A template is a ready-made BusinessConfig the owner edits during onboarding.
export const BusinessConfigSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().min(1),
  market: z.string().min(1),
  timeZone: z.string().refine(isTimeZone, "Unknown IANA time zone"),
  kind: z.enum(["onsite", "instore"]),
  serviceZones: z.array(z.string().min(1)).min(1),
  services: z.array(BusinessServiceSchema).min(1),
  greeting: z.string().min(1),
  note: z.string(),
  // Opening hours in the business time zone; bookable slots are generated from these.
  hours: z.object({ sun: DayHoursSchema, mon: DayHoursSchema, tue: DayHoursSchema, wed: DayHoursSchema, thu: DayHoursSchema, fri: DayHoursSchema, sat: DayHoursSchema }).default(DEFAULT_HOURS),
  slotMinutes: z.number().int().min(15).max(480).default(60)
});
export type BusinessConfig = z.infer<typeof BusinessConfigSchema>;
export type BusinessConfigInput = z.input<typeof BusinessConfigSchema>;
