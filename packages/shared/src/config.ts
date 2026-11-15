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
  note: z.string()
});
export type BusinessConfig = z.infer<typeof BusinessConfigSchema>;
