/**
 * Timezone-aware helpers for the repost V2 (SCA port) UI.
 *
 * The whole product is Vietnam-first, so the user picks schedule
 * times in GMT+7 wall clock. The backend stores everything in UTC; the
 * UI is responsible for converting in both directions and for telling
 * the user "không thể lên lịch giờ đã qua" before submitting.
 *
 * All public functions are pure: no Date.now() outside, no globals.
 * Tests can inject any "now" they like.
 */

export const APP_TZ_OFFSET_MINUTES = 7 * 60; // GMT+7

/**
 * Convert a Date (any zone) to a "YYYY-MM-DD HH:mm" string in GMT+7,
 * suitable for <input type="datetime-local">. The `datetime-local` input
 * expects local time without a timezone marker, and the form treats
 * whatever the user types as GMT+7.
 */
export function toGmt7DateTimeInput(d: Date): string {
  const shifted = new Date(d.getTime() + APP_TZ_OFFSET_MINUTES * 60_000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mi = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/**
 * Parse a "YYYY-MM-DDTHH:mm" string (from datetime-local) as GMT+7
 * and return the corresponding UTC Date.
 */
export function fromGmt7DateTimeInput(s: string): Date {
  // Treat the input as GMT+7 by appending a +07:00 offset.
  const iso = s.includes('T') ? `${s}:00+07:00` : `${s}T00:00:00+07:00`;
  return new Date(iso);
}

/**
 * Past-time guard. The backend also enforces this, but the UI should
 * fail fast and show a friendly toast rather than round-trip the
 * server. `now` defaults to `new Date()` for callers; tests pass a
 * fixed Date.
 *
 * Returns true if `when` is at or before `now` (i.e. cannot schedule).
 * The 30s grace matches the backend's minFutureSchedule.
 */
export function isInPast(when: Date, now: Date = new Date()): boolean {
  const graceMs = 30 * 1000;
  return when.getTime() <= now.getTime() + graceMs;
}

/**
 * Format a Date as "HH:mm DD/MM" in GMT+7 for queue rows.
 */
export function formatGmt7Short(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  const shifted = new Date(date.getTime() + APP_TZ_OFFSET_MINUTES * 60_000);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mi = String(shifted.getUTCMinutes()).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${hh}:${mi} ${dd}/${mm}`;
}
