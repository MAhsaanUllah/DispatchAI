export type DayHours = { open: string; close: string } | null;
export type WeekHours = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>;

const ORDER = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]] as const;

// "Mon to Fri 09:00 to 17:00, Sat 10:00 to 14:00". Days in a row with the same hours are grouped; closed days are left out.
export function hoursText(week: WeekHours): string {
  const groups: { from: string; to: string; time: string }[] = [];
  for (const [key, label] of ORDER) {
    const day = week[key];
    if (!day) continue;
    const time = `${day.open} to ${day.close}`;
    const last = groups[groups.length - 1];
    // Only extend a group when the previous day in the week order was also open with the same hours.
    const previousKey = ORDER[ORDER.findIndex(([k]) => k === key) - 1]?.[0];
    if (last && last.time === time && previousKey && week[previousKey]?.open === day.open && week[previousKey]?.close === day.close) last.to = label;
    else groups.push({ from: label, to: label, time });
  }
  if (groups.length === 0) return "Closed every day";
  return groups.map((group) => `${group.from === group.to ? group.from : `${group.from} to ${group.to}`} ${group.time}`).join(", ");
}
