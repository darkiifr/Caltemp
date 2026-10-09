import { describe, expect, it } from 'vitest';
import { computeNextIcsSyncDelay, getIcsSourceIntervalMs, isIcsSourceDue, mapWithConcurrency } from './icsScheduler';

const MINUTE = 60 * 1000;
const base = { enabled: true, type: 'url', url: 'https://example.com/a.ics', refreshMinutes: 5 };

describe('ICS refresh scheduler', () => {
  it('waits for the earliest due source instead of polling', () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    const sources = [
      { ...base, lastSyncedAt: '2026-07-07T11:58:00.000Z' }, // due in 3 min
      { ...base, refreshMinutes: 60, lastSyncedAt: '2026-07-07T11:30:00.000Z' }, // due in 30 min
      { ...base, enabled: false },
    ];
    expect(computeNextIcsSyncDelay(sources, now)).toBe(3 * MINUTE);
    expect(computeNextIcsSyncDelay(sources, now, { hidden: true })).toBe(5 * MINUTE);
    expect(computeNextIcsSyncDelay([], now)).toBe(30 * MINUTE);
  });

  it('treats never-synced sources as due and backs off after failures', () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    expect(isIcsSourceDue(base, now)).toBe(true);
    expect(isIcsSourceDue({ ...base, lastSyncedAt: '2026-07-07T11:59:00.000Z' }, now)).toBe(false);
    expect(getIcsSourceIntervalMs({ ...base, failureCount: 1 })).toBe(MINUTE);
    expect(getIcsSourceIntervalMs({ ...base, failureCount: 2 })).toBe(2 * MINUTE);
    expect(getIcsSourceIntervalMs({ ...base, failureCount: 9 })).toBe(5 * MINUTE);
  });

  it('runs workers with bounded concurrency and keeps result order', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 10, 20, 5, 1], 2, async (ms) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, ms));
      running -= 1;
      return ms * 2;
    });
    expect(peak).toBe(2);
    expect(results).toEqual([60, 20, 40, 10, 2]);
  });
});
