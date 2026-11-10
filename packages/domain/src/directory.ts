import type { DispatchStore } from "./store.js";
import { getBusinessConfig } from "./templates.js";

export function getDirectory(store: DispatchStore) {
  const { name, market, timeZone, serviceZones, note, services } = getBusinessConfig();
  store.addUpcomingSlots();
  const now = new Date().toISOString();
  const technicians = [...store.technicians.values()].map((technician) => ({
    ...technician,
    upcomingSlots: [...store.slots.values()]
      .filter((slot) => slot.technicianId === technician.id && slot.startAt >= now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 12)
  }));
  return { company: { name, market, timeZone, serviceZones, note }, services, technicians };
}
