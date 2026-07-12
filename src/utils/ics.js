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

function toIso(value) {
    if (!value) return null;
    const date = value.toJSDate ? value.toJSDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

function recurrenceFromEvent(vevent) {
    const rrule = vevent.getFirstPropertyValue('rrule');
    const freq = rrule?.freq?.toUpperCase?.();
    if (freq === 'DAILY') return 'daily';
    if (freq === 'WEEKLY') return 'weekly';
    if (freq === 'MONTHLY') return 'monthly';
    if (freq === 'YEARLY') return 'yearly';
    return undefined;
}

function parseAlarms(vevent) {
    return vevent.getAllSubcomponents('valarm').map(alarm => ({
        trigger: String(alarm.getFirstPropertyValue('trigger') || ''),
        action: getTextProperty(alarm, 'action'),
        description: getTextProperty(alarm, 'description'),
    }));
}

// Utility to parse ICS file content
export function parseICS(icsContent) {
    if (!icsContent?.trim()) return [];

    let calendar;
    try {
        calendar = new ICAL.Component(ICAL.parse(unfoldIcsContent(icsContent)));
    } catch (error) {
        console.error('Failed to parse ICS:', error);
        return [];
    }

    const events = [];
    const seen = new Set();

    for (const vevent of calendar.getAllSubcomponents('vevent')) {
        const event = new ICAL.Event(vevent);
        const date = toIso(event.startDate);
        const title = event.summary || getTextProperty(vevent, 'summary');
        if (!title || !date) continue;

        const externalId = event.uid || getTextProperty(vevent, 'uid') || null;
        const endDate = toIso(event.endDate);
        const diff = endDate ? new Date(endDate) - new Date(date) : 0;
        const sequence = Number(vevent.getFirstPropertyValue('sequence'));
        const lastModified = toIso(vevent.getFirstPropertyValue('last-modified') || vevent.getFirstPropertyValue('dtstamp'));
        const sourceCategories = getAllTextProperties(vevent, 'categories');
        const dedupeKey = externalId || `${title}:${date}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        events.push({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
            source: 'ics',
            externalId,
            uid: externalId,
            title,
            description: event.description || getTextProperty(vevent, 'description'),
            date,
            endDate,
            allDay: Boolean(event.startDate?.isDate),
            durationMinutes: diff > 0 ? Math.max(1, Math.round(diff / 60000)) : 60,
            recurrence: recurrenceFromEvent(vevent),
            location: event.location || getTextProperty(vevent, 'location'),
            url: getTextProperty(vevent, 'url'),
            sourceCategories,
            status: getTextProperty(vevent, 'status'),
            transparency: getTextProperty(vevent, 'transp'),
            sequence: Number.isFinite(sequence) ? sequence : undefined,
            lastModified,
            alarms: parseAlarms(vevent),
        });
    }

    return events;
}
