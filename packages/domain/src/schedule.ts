import { WEEKDAYS, type BusinessConfig, type Technician, type TechnicianSlot } from "@dispatchai/shared";

// Intl formatters are slow to build; availability checks call these for every slot, so cache one per zone.
const wallClock = new Map<string, Intl.DateTimeFormat>();
const dayOnly = new Map<string, Intl.DateTimeFormat>();
const cached = (cache: Map<string, Intl.DateTimeFormat>, timeZone: string, make: () => Intl.DateTimeFormat) => {
  let formatter = cache.get(timeZone);
  if (!formatter) cache.set(timeZone, (formatter = make()));
  return formatter;
};

// Offset (ms) of a time zone at a UTC instant, from Intl: local wall-clock as UTC minus the instant.
function offsetAt(utcMs: number, timeZone: string): number {
  const parts = cached(wallClock, timeZone, () => new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
  })).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(utcMs / 1000) * 1000;
}

// "2026-03-08" + "09:00" in America/Chicago -> UTC instant. Second pass handles a DST change between guess and answer.
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - offsetAt(wall, timeZone);
  return new Date(wall - offsetAt(first, timeZone));
}

// Calendar date of an instant in the business time zone ("YYYY-MM-DD").
export function localDate(instant: string | Date, timeZone: string): string {
  return cached(dayOnly, timeZone, () => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })).format(new Date(instant));
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// Bookable slots for every active staff member from opening hours, for `days` local days starting today.
export function generateScheduleSlots(config: BusinessConfig, technicians: Technician[], from = new Date(), days = 14): TechnicianSlot[] {
  const slots: TechnicianSlot[] = [];
  const [y, m, d] = localDate(from, config.timeZone).split("-").map(Number);
  for (let offset = 0; offset < days; offset++) {
    const day = new Date(Date.UTC(y, m - 1, d + offset));
    const date = day.toISOString().slice(0, 10);
    const weekday = WEEKDAYS[day.getUTCDay()];
    const business = config.hours[weekday];
    if (!business) continue;
    for (let start = toMinutes(business.open); start + config.slotMinutes <= toMinutes(business.close); start += config.slotMinutes) {
      const startTime = toTime(start);
      const startAt = zonedTimeToUtc(date, startTime, config.timeZone).toISOString();
      const endAt = zonedTimeToUtc(date, toTime(start + config.slotMinutes), config.timeZone).toISOString();
      for (const tech of technicians) {
        if (tech.status !== "ACTIVE") continue;
        // A person's own hours only narrow the business hours; with none set they work the business hours.
        const own = tech.hours ? tech.hours[weekday] : business;
        if (!own || start < toMinutes(own.open) || start + config.slotMinutes > toMinutes(own.close)) continue;
        slots.push({ id: `slot_${date.replaceAll("-", "")}_${tech.id}_${startTime.replace(":", "")}`, technicianId: tech.id, startAt, endAt, status: "AVAILABLE" });
      }
    }
  }
  return slots;
}
