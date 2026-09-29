import type { DispatchStore } from "./store.js";

export const companyProfile = {
  name: "Austin Metro Service Dispatch",
  market: "Austin, Texas",
  timeZone: "America/Chicago",
  serviceZones: ["Austin-Central", "Austin-North", "Austin-South", "Austin-East"],
  note: "Portfolio demo company. Staff, coverage and schedules are seeded—not connected to a live company calendar."
};

export const serviceCatalog = [
  { id: "HVAC", name: "HVAC", description: "Heating, air conditioning and ventilation service", priceNote: "A dispatcher must confirm any diagnostic fee or estimate." },
  { id: "PLUMBING", name: "Plumbing", description: "Leaks, drains, fixtures and water-service issues", priceNote: "A dispatcher must confirm any diagnostic fee or estimate." }
] as const;

export function getDirectory(store: DispatchStore) {
  store.addUpcomingSlots();
  const now = new Date().toISOString();
  const technicians = [...store.technicians.values()].map((technician) => ({
    ...technician,
    upcomingSlots: [...store.slots.values()]
      .filter((slot) => slot.technicianId === technician.id && slot.startAt >= now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 12)
  }));
  return { company: companyProfile, services: serviceCatalog, technicians };
}
