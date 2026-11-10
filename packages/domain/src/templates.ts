import { BusinessConfigSchema, type BusinessConfig } from "@dispatchai/shared";

const PRICE_NOTE = "Staff must confirm any fee or estimate.";

// Fictional demo businesses. Field Service matches the original Austin demo seed exactly.
const raw: BusinessConfig[] = [
  {
    templateId: "field-service",
    name: "Austin Metro Service Dispatch",
    market: "Austin, Texas",
    timeZone: "America/Chicago",
    kind: "onsite",
    serviceZones: ["Austin-Central", "Austin-North", "Austin-South", "Austin-East"],
    services: [
      { id: "HVAC", name: "HVAC", description: "Heating, air conditioning and ventilation service", priceNote: "A dispatcher must confirm any diagnostic fee or estimate." },
      { id: "PLUMBING", name: "Plumbing", description: "Leaks, drains, fixtures and water-service issues", priceNote: "A dispatcher must confirm any diagnostic fee or estimate." }
    ],
    greeting: "I am DispatchAI, your Austin HVAC and plumbing assistant. You can tell me your service issue, provide your phone number, or ask for appointment availability.",
    note: "Portfolio demo company. Staff, coverage and schedules are seeded—not connected to a live company calendar."
  },
  {
    templateId: "salon",
    name: "Maple Street Salon",
    market: "Demo City",
    timeZone: "America/Chicago",
    kind: "instore",
    serviceZones: ["Main Street Studio"],
    services: [
      { id: "HAIRCUT", name: "Haircut", description: "Cut and style", priceNote: PRICE_NOTE },
      { id: "COLOR", name: "Color", description: "Full or partial hair color", priceNote: PRICE_NOTE }
    ],
    greeting: "Hi, this is the Maple Street Salon booking assistant. Tell me which service you want and when, or give me your phone number.",
    note: "Fictional demo salon."
  },
  {
    templateId: "auto-repair",
    name: "Riverside Auto Care",
    market: "Demo City",
    timeZone: "America/Chicago",
    kind: "instore",
    serviceZones: ["Riverside Garage"],
    services: [
      { id: "OIL_CHANGE", name: "Oil change", description: "Oil and filter change", priceNote: PRICE_NOTE },
      { id: "BRAKES", name: "Brake inspection", description: "Brake check and quote", priceNote: PRICE_NOTE }
    ],
    greeting: "Hi, this is the Riverside Auto Care booking assistant. Tell me what your vehicle needs and when, or give me your phone number.",
    note: "Fictional demo garage."
  },
  {
    templateId: "home-cleaning",
    name: "Bright Home Cleaning",
    market: "Demo City",
    timeZone: "America/Chicago",
    kind: "onsite",
    serviceZones: ["North", "South"],
    services: [
      { id: "STANDARD_CLEAN", name: "Standard clean", description: "Regular home cleaning", priceNote: PRICE_NOTE },
      { id: "DEEP_CLEAN", name: "Deep clean", description: "Top-to-bottom cleaning", priceNote: PRICE_NOTE }
    ],
    greeting: "Hi, this is the Bright Home Cleaning booking assistant. Tell me which cleaning you need and when, or give me your phone number.",
    note: "Fictional demo cleaning company."
  }
];

export const businessTemplates: readonly BusinessConfig[] = raw.map((config) => BusinessConfigSchema.parse(config));

// globalThis lookup keeps this file type-safe in packages without Node types (web, worker).
const envTemplate = () => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BUSINESS_TEMPLATE;

export function getBusinessConfig(templateId = envTemplate() || "field-service"): BusinessConfig {
  const config = businessTemplates.find((template) => template.templateId === templateId);
  if (!config) {
    const known = businessTemplates.map((template) => template.templateId).join(", ");
    throw new Error(`Unknown BUSINESS_TEMPLATE "${templateId}". Use one of: ${known}`);
  }
  return config;
}
