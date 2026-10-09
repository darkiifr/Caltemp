import { getIcsRefreshMinutes } from './icsSources';

export const ICS_SYNC_CONCURRENCY = 3;
const MINUTE_MS = 60 * 1000;
const MIN_DELAY_MS = 15 * 1000;
// While the window is hidden nobody is looking: refresh at most every 5 minutes.
const HIDDEN_MIN_DELAY_MS = 5 * MINUTE_MS;
const IDLE_DELAY_MS = 30 * MINUTE_MS;

function isActiveUrlSource(source) {
  return Boolean(source?.enabled && source.type === 'url' && source.url);
}

/** Interval before the next refresh of `source`, with backoff after failures. */
export function getIcsSourceIntervalMs(source = {}) {
  const intervalMs = getIcsRefreshMinutes(source) * MINUTE_MS;
  const failures = Number(source.failureCount) || 0;
  if (!failures) return intervalMs;
  return Math.min(intervalMs, MINUTE_MS * 2 ** Math.min(failures - 1, 10));
}

export function getIcsSourceDueAt(source = {}) {
  const last = source.lastSyncedAt ? new Date(source.lastSyncedAt).getTime() : 0;
  if (!last || Number.isNaN(last)) return 0;
  return last + getIcsSourceIntervalMs(source);
}

export function isIcsSourceDue(source, now = new Date()) {
  return isActiveUrlSource(source) && getIcsSourceDueAt(source) <= now.getTime();
}

/** Delay until the earliest active source is due (no fixed polling). */
export function computeNextIcsSyncDelay(sources = [], now = new Date(), { hidden = false } = {}) {
  let next = Infinity;
  for (const source of sources) {
    if (isActiveUrlSource(source)) next = Math.min(next, getIcsSourceDueAt(source));
  }
  if (next === Infinity) return IDLE_DELAY_MS;
  const delay = Math.max(MIN_DELAY_MS, next - now.getTime());
  return hidden ? Math.max(HIDDEN_MIN_DELAY_MS, delay) : Math.min(delay, IDLE_DELAY_MS);
}

export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, run));
  return results;
}
