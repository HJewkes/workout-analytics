/**
 * Calendar arithmetic on 'YYYY-MM-DD' day strings, each read as UTC midnight
 * so no timezone or daylight-saving change can shift a day. Callers decide
 * which local date a session belongs to before handing days in.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of the ISO week `day` falls in. */
export function isoWeekStart(day: string): string {
  const weekday = new Date(Date.parse(day)).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** Every Monday from the week of `first` to the week of `last`, inclusive. */
export function weeksSpanning(first: string, last: string): string[] {
  const weeks: string[] = [];
  for (let week = isoWeekStart(first); week <= last; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

/** The distinct days, oldest first. */
export function sortedDistinctDays(days: readonly string[]): string[] {
  return [...new Set(days)].sort();
}

/** A stretch with no training between two consecutive training days. */
export interface DayGap {
  /** The last training day before the gap. */
  after: string;
  /** The first training day after the gap. */
  endsOn: string;
  /** Calendar days between the two, so consecutive days read 1. */
  days: number;
}

/** The gaps between consecutive days of a sorted, distinct list, oldest first. */
export function dayGaps(sortedDays: readonly string[]): DayGap[] {
  return sortedDays.slice(1).map((day, index) => ({
    after: sortedDays[index],
    endsOn: day,
    days: daysBetween(sortedDays[index], day),
  }));
}
