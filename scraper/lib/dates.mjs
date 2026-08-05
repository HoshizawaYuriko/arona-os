// Date helpers. Everything is handled as UTC on purpose:
// Cargo's Start_date/End_date fields come back UTC-normalized (verified: JP's 11:00 JST
// reset shows up as "02:00:00", i.e. JST-9h), and the calendar *date* never rolls over
// between JST and UTC for these reset times, so treating the strings as plain UTC
// instants avoids the CI runner's local timezone silently shifting a weekday.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses a Cargo "YYYY-MM-DD HH:MM:SS" string as a UTC Date. */
export function parseCargoDate(str) {
  if (!str) return null;
  const [datePart, timePart = '00:00:00'] = str.trim().split(' ');
  return new Date(`${datePart}T${timePart}Z`);
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function diffDays(a, b) {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

/** Tuesday = 2 in JS's UTC-day numbering (0=Sun). Returns the same date if it's already Tuesday. */
export function nextTuesdayOnOrAfter(date) {
  const day = date.getUTCDay();
  const delta = (2 - day + 7) % 7;
  return addDays(date, delta);
}

/**
 * The next Tuesday reset moment after a *confirmed run's end timestamp*.
 *
 * Cargo's End_date is always "one minute before the actual reset" (e.g. a run ending
 * "01:59" frees up the "02:00" slot the very same day) — so advancing a whole day
 * before checking the weekday, as `addDays(end, 1)` + `nextTuesdayOnOrAfter` did, skips
 * an entire real week whenever the end already falls on a Tuesday: it rounds the
 * now-Wednesday moment forward to *next* week's Tuesday instead of recognizing the
 * same-day slot that was actually free. Confirmed against real data: an end of
 * "2026-08-18 01:59" (a Tuesday) must yield the very same day at "02:00", not
 * "2026-08-25". Add the 1 minute back first, *then* round to Tuesday.
 */
export function nextTuesdayResetAfterEnd(endDate) {
  return nextTuesdayOnOrAfter(new Date(endDate.getTime() + 60_000));
}

/** Rounds an observed JP run length to Blue Archive's only two valid durations. */
export function snapDurationDays(days) {
  return days <= 10 ? 7 : 14;
}

/**
 * Rounds an observed gap between consecutive JP waves to the nearest whole week, so
 * replicating it on GL never breaks Tuesday alignment. Verified against real JP event
 * history: raw gaps cluster tightly around multiples of 7 (7, 14, and a handful of 6/9/13
 * — almost certainly one-off maintenance-day shifts) rather than landing on arbitrary
 * values, so "nearest week" is a snap, not a guess.
 */
export function snapGapDays(days) {
  return Math.round(Math.max(days, 0) / 7) * 7;
}

export function toIsoDate(date) {
  return date.toISOString();
}

/**
 * Parses a manual-override date from confirmed.json. A bare "YYYY-MM-DD" is
 * normalized onto the standard 02:00 UTC reset moment (matching every other start
 * timestamp in the system) rather than midnight, so an override lands visually
 * consistent with everything computed automatically. A full timestamp is trusted as-is.
 */
export function parseOverrideDate(str) {
  const bareDate = /^\d{4}-\d{2}-\d{2}$/.test(str.trim());
  return new Date(bareDate ? `${str.trim()}T02:00:00Z` : str);
}