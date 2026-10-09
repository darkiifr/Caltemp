import { getNextOccurrence, normalizeEventCached } from './events';
import { isGeocodableLocation, normalizeLocationKey, project, resolveEventPosition } from './geo';

const DAY_MS = 86400000;

/**
 * Events -> map items. `lookup(text)` reads the geocoding cache and returns
 * coordinates, `null` for a known miss or `undefined` when never asked.
 * Returns the positioned items (soonest first), the distinct locations still
 * worth geocoding and how many are known to be unplaceable.
 */
export function buildMapItems(events, { now = new Date(), period = '30', alertsOnly = false, lookup = null } = {}) {
    const limit = period === 'all' ? Infinity : now.getTime() + Number(period) * DAY_MS;
    const items = [];
    const unresolved = new Map();
    const misses = new Set();

    for (const raw of events || []) {
        const event = normalizeEventCached(raw);
        if (!event.location && !event.geo) continue;
        if (alertsOnly && !event.reminder) continue;
        const next = getNextOccurrence(event, now);
        if (period !== 'all' && (!next || next.getTime() > limit)) continue;

        const position = resolveEventPosition(event, lookup);
        if (!position) {
            if (isGeocodableLocation(event.location)) {
                const key = normalizeLocationKey(event.location);
                if (lookup?.(event.location) === null) misses.add(key);
                else if (!unresolved.has(key)) unresolved.set(key, event.location);
            }
            continue;
        }
        const { x, y } = project(position.lat, position.lng);
        items.push({
            key: event.id,
            x,
            y,
            color: event.color,
            label: event.location ? `${event.title} — ${event.location}` : event.title,
            badge: event.reminder ? '●' : '',
            event,
            next,
            placeLabel: event.location || position.label || `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`,
        });
    }

    items.sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));
    return { items, unresolved: Array.from(unresolved.values()), notFound: misses.size };
}
