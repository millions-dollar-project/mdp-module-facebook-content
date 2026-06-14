/**
 * Tests for lib/time.ts. Run with `pnpm test`.
 */
import { describe, expect, it } from 'vitest';
import {
  APP_TZ_OFFSET_MINUTES,
  formatGmt7Short,
  fromGmt7DateTimeInput,
  isInPast,
  toGmt7DateTimeInput,
} from './time';

describe('toGmt7DateTimeInput', () => {
  it('shifts a UTC date into GMT+7 wall clock', () => {
    // 2026-06-11T01:00:00Z = 2026-06-11T08:00:00+07:00
    const d = new Date('2026-06-11T01:00:00Z');
    expect(toGmt7DateTimeInput(d)).toBe('2026-06-11T08:00');
  });

  it('crosses the date boundary when shifting', () => {
    // 2026-06-10T20:00:00Z = 2026-06-11T03:00:00+07:00
    const d = new Date('2026-06-10T20:00:00Z');
    expect(toGmt7DateTimeInput(d)).toBe('2026-06-11T03:00');
  });
});

describe('fromGmt7DateTimeInput', () => {
  it('parses a datetime-local string as GMT+7', () => {
    const out = fromGmt7DateTimeInput('2026-06-11T08:00');
    expect(out.toISOString()).toBe('2026-06-11T01:00:00.000Z');
  });
});

describe('round-trip', () => {
  it('toGmt7 then fromGmt7 preserves the minute (seconds are truncated by datetime-local)', () => {
    // datetime-local is minute-precision, so the round-trip drops seconds.
    const original = new Date('2026-06-11T01:23:00Z');
    const round = fromGmt7DateTimeInput(toGmt7DateTimeInput(original));
    expect(round.toISOString()).toBe(original.toISOString());
  });
});

describe('isInPast', () => {
  it('rejects now', () => {
    const now = new Date('2026-06-11T08:00:00Z');
    expect(isInPast(new Date('2026-06-11T08:00:00Z'), now)).toBe(true);
  });
  it('rejects within the 30s grace window', () => {
    const now = new Date('2026-06-11T08:00:00Z');
    expect(isInPast(new Date('2026-06-11T08:00:29Z'), now)).toBe(true);
  });
  it('accepts past the grace window', () => {
    const now = new Date('2026-06-11T08:00:00Z');
    expect(isInPast(new Date('2026-06-11T08:00:31Z'), now)).toBe(false);
  });
  it('rejects yesterday', () => {
    const now = new Date('2026-06-11T08:00:00Z');
    expect(isInPast(new Date('2026-06-10T08:00:00Z'), now)).toBe(true);
  });
});

describe('formatGmt7Short', () => {
  it('formats HH:mm DD/MM in GMT+7', () => {
    // 2026-06-11T01:30:00Z = 08:30 11/06
    const out = formatGmt7Short(new Date('2026-06-11T01:30:00Z'));
    expect(out).toBe('08:30 11/06');
  });
  it('returns — for null/empty', () => {
    expect(formatGmt7Short(null)).toBe('—');
    expect(formatGmt7Short('')).toBe('—');
  });
  it('exports the correct offset constant', () => {
    expect(APP_TZ_OFFSET_MINUTES).toBe(420);
  });
});
