import ICAL from 'ical.js';

// Utility to generate ICS file content
export function generateICS(events) {
    if (!events || events.length === 0) return '';

    const formatDate = (dateStr) => {
        // ICS date format: YYYYMMDDTHHmmssZ
        const d = new Date(dateStr);
        return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Caltemp//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ];

    events.forEach(event => {
        const start = formatDate(event.date); // Assuming date includes time or is handled
        // For simplicity, assuming 1 hour duration if not specified, or just all day if no time
        const eventDate = new Date(event.date);
        const end = formatDate(new Date(eventDate.getTime() + 60 * 60 * 1000).toISOString()); // Default 1h

        icsContent.push('BEGIN:VEVENT');
        icsContent.push(`UID:${event.id || Date.now()}@caltemp`);
        icsContent.push(`DTSTAMP:${formatDate(new Date().toISOString())}`);
        icsContent.push(`DTSTART:${start}`);
        icsContent.push(`DTEND:${end}`);
        icsContent.push(`SUMMARY:${event.title}`);
        if(event.description) icsContent.push(`DESCRIPTION:${event.description}`);
        icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    return icsContent.join('\r\n');
}

const DAY_MS = 86400000;
const DEFAULT_LOOKBACK_DAYS = 365;
const DEFAULT_HORIZON_DAYS = 730;
const MAX_OCCURRENCES_PER_SERIES = 1000;
const MAX_ITERATIONS_PER_SERIES = 20000;

// Wall-clock -> UTC conversion for TZID values whose VTIMEZONE block is missing
// (very common in published feeds). ical.js treats those as floating times,
// which silently shifts every event by the user's own UTC offset.
const zoneFormatters = new Map();

function getZoneFormatter(tzid) {
    if (zoneFormatters.has(tzid)) return zoneFormatters.get(tzid);
    let formatter = null;
    try {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tzid,
            hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    } catch {
        formatter = null;
    }
    zoneFormatters.set(tzid, formatter);
    return formatter;
}

function zoneOffsetMs(formatter, timestamp) {
    const parts = {};
    for (const part of formatter.formatToParts(timestamp)) parts[part.type] = part.value;
    const asUtc = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
    );
    return asUtc - Math.floor(timestamp / 1000) * 1000;
}

export function zonedWallTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, tzid) {
    const formatter = tzid ? getZoneFormatter(tzid) : null;
    if (!formatter) return null;
    const wall = Date.UTC(year, month - 1, day, hour, minute, second);
    const firstOffset = zoneOffsetMs(formatter, wall);
    let utc = wall - firstOffset;
    const secondOffset = zoneOffsetMs(formatter, utc);
    if (secondOffset !== firstOffset) utc = wall - secondOffset;
    return utc;
}

function isResolvedZone(time) {
    const tzid = time?.zone?.tzid;
    return Boolean(tzid) && tzid !== 'floating';
}

function timeToMs(time, fallbackTzid = '') {
    if (!time) return null;
    if (!time.toJSDate) {
        const parsed = new Date(time).getTime();
        return Number.isNaN(parsed) ? null : parsed;
    }
    if (!time.isDate && !isResolvedZone(time)) {
        const tzid = time.timezone || fallbackTzid;
        const utc = tzid ? zonedWallTimeToUtc(time, tzid) : null;
        if (utc != null) return utc;
    }
    const ms = time.toJSDate().getTime();
    return Number.isNaN(ms) ? null : ms;
}

function toIso(value, fallbackTzid = '') {
    const ms = timeToMs(value, fallbackTzid);
    return ms == null ? null : new Date(ms).toISOString();
}

function unfoldIcsContent(content) {
    const rawLines = content.split(/\r\n|\n|\r/);
    const lines = [];
    for (const line of rawLines) {
        if (/^[ \t]/.test(line) && lines.length > 0) {
            const continuation = line.slice(1);
            const previous = lines[lines.length - 1];
            const needsSpace = continuation && !/^\s/.test(continuation) && !/\s$/.test(previous);
            lines[lines.length - 1] += `${needsSpace ? ' ' : ''}${continuation}`;
        } else {
            lines.push(line);
        }
    }
    return lines.join('\r\n');
}

function getTextProperty(component, name) {
    const property = component.getFirstProperty(name);
    if (!property) return '';
    const value = property.getFirstValue();
    return value == null ? '' : String(value);
}

function getAllTextProperties(component, name) {
    return component.getAllProperties(name)
        .flatMap((property) => {
            const first = property.getFirstValue();
            if (Array.isArray(first)) return first;
            return String(first || '')
                .split(',')
                .map(item => item.trim())
                .filter(Boolean);
        })
        .filter(Boolean);
}

function getTzid(component, name) {
    return component.getFirstProperty(name)?.getParameter('tzid') || '';
}

const NATIVE_RECURRENCES = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' };
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Caltemp's own recurrence model is "every day/week/month/year from DTSTART,
// forever". A rule is kept native only when it means exactly that; anything
// richer (COUNT, UNTIL, INTERVAL, several BYDAY, EXDATE, overridden instances...)
// is expanded into concrete occurrences so the calendar shows what the feed says.
function getNativeRecurrence(vevent, start, hasExceptions) {
    const rule = vevent.getFirstPropertyValue('rrule');
    const recurrence = NATIVE_RECURRENCES[rule?.freq?.toUpperCase?.()];
    if (!rule || !recurrence || hasExceptions) return null;
    if (vevent.getFirstProperty('exdate') || vevent.getFirstProperty('rdate')) return null;
    if (vevent.getAllProperties('rrule').length > 1) return null;
    if (rule.count || rule.until || (rule.interval && rule.interval !== 1)) return null;

    const startDate = new Date(start);
    for (const [part, values] of Object.entries(rule.parts || {})) {
        const list = (Array.isArray(values) ? values : [values]).map(String);
        if (list.length !== 1) return null;
        const [value] = list;
        if (part === 'BYDAY' && recurrence === 'weekly' && value.toUpperCase() === WEEKDAY_CODES[startDate.getDay()]) continue;
        if (part === 'BYMONTHDAY' && (recurrence === 'monthly' || recurrence === 'yearly') && Number(value) === startDate.getDate()) continue;
        if (part === 'BYMONTH' && recurrence === 'yearly' && Number(value) === startDate.getMonth() + 1) continue;
        return null;
    }
    return recurrence;
}

function parseAlarms(vevent) {
    return vevent.getAllSubcomponents('valarm').map(alarm => ({
        trigger: String(alarm.getFirstPropertyValue('trigger') || ''),
        action: getTextProperty(alarm, 'action'),
        description: getTextProperty(alarm, 'description'),
    }));
}

export function parseGeoValue(value) {
    if (value == null) return null;
    let lat;
    let lng;
    if (Array.isArray(value)) {
        [lat, lng] = value.map(Number);
    } else {
        const match = String(value).trim().match(/^(-?\d+(?:\.\d+)?)\s*[;,]\s*(-?\d+(?:\.\d+)?)$/);
        if (!match) return null;
        lat = Number(match[1]);
        lng = Number(match[2]);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng, source: 'ics' };
}

function isCancelled(vevent) {
    return getTextProperty(vevent, 'status').toUpperCase() === 'CANCELLED';
}

function buildEvent(vevent, { startMs, endMs, allDay, externalId, uid, recurrence }) {
    const sequence = Number(vevent.getFirstPropertyValue('sequence'));
    const diff = endMs != null ? endMs - startMs : 0;
    const geo = parseGeoValue(vevent.getFirstPropertyValue('geo'));
    return {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
        source: 'ics',
        externalId,
        uid,
        title: getTextProperty(vevent, 'summary'),
        description: getTextProperty(vevent, 'description'),
        date: new Date(startMs).toISOString(),
        endDate: endMs != null ? new Date(endMs).toISOString() : null,
        allDay,
        durationMinutes: diff > 0 ? Math.max(1, Math.round(diff / 60000)) : 60,
        recurrence,
        location: getTextProperty(vevent, 'location'),
        ...(geo && { geo }),
        url: getTextProperty(vevent, 'url'),
        sourceCategories: getAllTextProperties(vevent, 'categories'),
        status: getTextProperty(vevent, 'status'),
        transparency: getTextProperty(vevent, 'transp'),
        sequence: Number.isFinite(sequence) ? sequence : undefined,
        lastModified: toIso(vevent.getFirstPropertyValue('last-modified') || vevent.getFirstPropertyValue('dtstamp')),
        alarms: parseAlarms(vevent),
    };
}

function expandSeries(master, exceptions, uid, window, emit) {
    const event = new ICAL.Event(master);
    for (const exception of exceptions) {
        try {
            event.relateException(new ICAL.Event(exception));
        } catch {
            // A malformed override must not drop the whole series.
        }
    }
    const masterTzid = getTzid(master, 'dtstart');
    const allDay = Boolean(event.startDate?.isDate);
    const iterator = event.iterator();
    let produced = 0;

    for (let guard = 0; guard < MAX_ITERATIONS_PER_SERIES; guard += 1) {
        const next = iterator.next();
        if (!next) break;
        const recurrenceMs = timeToMs(next, masterTzid);
        if (recurrenceMs == null) continue;
        if (recurrenceMs > window.end) break;

        const details = event.getOccurrenceDetails(next);
        const item = details.item.component;
        const itemTzid = getTzid(item, 'dtstart') || masterTzid;
        const startMs = timeToMs(details.startDate, itemTzid);
        if (startMs == null || startMs < window.start) continue;
        if (isCancelled(item)) continue;

        const endMs = timeToMs(details.endDate, getTzid(item, 'dtend') || itemTzid);
        const occurrence = buildEvent(item, {
            startMs,
            endMs,
            allDay,
            uid,
            externalId: `${uid}#${new Date(recurrenceMs).toISOString()}`,
            recurrence: undefined,
        });
        if (!occurrence.title) occurrence.title = getTextProperty(master, 'summary');
        emit(occurrence);
        produced += 1;
        if (produced >= MAX_OCCURRENCES_PER_SERIES) break;
    }
}

/**
 * Parses ICS content into Caltemp events.
 *
 * Recurring series that Caltemp cannot represent natively are expanded between
 * `now - lookbackDays` and `now + horizonDays`; each instance gets a stable
 * `externalId` (`UID#RECURRENCE-ID`) so subscription syncs update it in place.
 */
export function parseICS(icsContent, options = {}) {
    if (!icsContent?.trim()) return [];

    let calendar;
    try {
        calendar = new ICAL.Component(ICAL.parse(unfoldIcsContent(icsContent)));
    } catch (error) {
        console.error('Failed to parse ICS:', error);
        return [];
    }

    const now = options.now ? new Date(options.now).getTime() : Date.now();
    const window = {
        start: now - (options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * DAY_MS,
        end: now + (options.horizonDays ?? DEFAULT_HORIZON_DAYS) * DAY_MS,
    };

    // Group components per UID: one master plus its RECURRENCE-ID overrides,
    // whatever order the feed lists them in.
    const series = new Map();
    let anonymous = 0;
    for (const vevent of calendar.getAllSubcomponents('vevent')) {
        const uid = getTextProperty(vevent, 'uid') || `anonymous-${anonymous += 1}`;
        let entry = series.get(uid);
        if (!entry) {
            entry = { master: null, exceptions: [] };
            series.set(uid, entry);
        }
        if (vevent.getFirstProperty('recurrence-id')) entry.exceptions.push(vevent);
        else if (!entry.master) entry.master = vevent;
    }

    const events = [];
    const seen = new Set();
    const emit = (event) => {
        if (!event.title || !event.date) return;
        const dedupeKey = event.externalId || `${event.title}:${event.date}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        events.push(event);
    };

    for (const [uid, { master, exceptions }] of series) {
        const realUid = uid.startsWith('anonymous-') ? null : uid;
        try {
            if (master) {
                if (isCancelled(master)) continue;
                const event = new ICAL.Event(master);
                const tzid = getTzid(master, 'dtstart');
                const startMs = timeToMs(event.startDate, tzid);
                if (startMs == null) continue;
                const endMs = timeToMs(event.endDate, getTzid(master, 'dtend') || tzid);
                const allDay = Boolean(event.startDate?.isDate);

                if (!event.isRecurring()) {
                    emit(buildEvent(master, { startMs, endMs, allDay, uid: realUid, externalId: realUid, recurrence: undefined }));
                    continue;
                }

                const recurrence = getNativeRecurrence(master, startMs, exceptions.length > 0);
                if (recurrence) {
                    emit(buildEvent(master, { startMs, endMs, allDay, uid: realUid, externalId: realUid, recurrence }));
                } else if (realUid) {
                    expandSeries(master, exceptions, realUid, window, emit);
                }
                continue;
            }

            // Overrides published without their master: keep them as one-offs.
            for (const exception of exceptions) {
                if (isCancelled(exception)) continue;
                const event = new ICAL.Event(exception);
                const tzid = getTzid(exception, 'dtstart');
                const startMs = timeToMs(event.startDate, tzid);
                if (startMs == null) continue;
                const recurrenceId = toIso(exception.getFirstPropertyValue('recurrence-id'), getTzid(exception, 'recurrence-id') || tzid);
                emit(buildEvent(exception, {
                    startMs,
                    endMs: timeToMs(event.endDate, getTzid(exception, 'dtend') || tzid),
                    allDay: Boolean(event.startDate?.isDate),
                    uid: realUid,
                    externalId: realUid ? `${realUid}#${recurrenceId}` : null,
                    recurrence: undefined,
                }));
            }
        } catch (error) {
            console.error('Skipping malformed ICS event:', uid, error);
        }
    }

    return events;
}
