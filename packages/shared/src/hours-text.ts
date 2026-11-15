import type { WeekHours } from "./config.js";

const ORDER = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]] as const;

// "Mon to Fri 09:00 to 17:00, Sat 10:00 to 14:00". Days in a row with the same hours are grouped; closed days are left out.
export function hoursText(week: WeekHours): string {
  const groups: { from: string; to: string; time: string }[] = [];
  ORDER.forEach(([key, label], index) => {
    const day = week[key];
    if (!day) return;
    const time = `${day.open} to ${day.close}`;
    const last = groups[groups.length - 1];
    const previous = index > 0 ? week[ORDER[index - 1][0]] : null;
    if (last && previous && previous.open === day.open && previous.close === day.close) last.to = label;
    else groups.push({ from: label, to: label, time });
  });
  if (groups.length === 0) return "Closed every day";
  return groups.map((group) => `${group.from === group.to ? group.from : `${group.from} to ${group.to}`} ${group.time}`).join(", ");
}
