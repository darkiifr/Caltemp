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

// Utility to parse ICS file content
export function parseICS(icsContent) {
    const events = [];
    const rawLines = icsContent.split(/\r\n|\n|\r/);
    const lines = [];
    for (const line of rawLines) {
        if (/^[ \t]/.test(line) && lines.length > 0) {
            const continuation = line.slice(1);
            const needsSpace = continuation && !/^\s/.test(continuation) && !/\s$/.test(lines[lines.length - 1]);
            lines[lines.length - 1] += `${needsSpace ? ' ' : ''}${continuation}`;
        } else {
            lines.push(line);
        }
    }
    let currentEvent = null;
    const seen = new Set();

    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        const cleanDate = dateStr.trim();
        // Format: YYYYMMDDTHHmmssZ or YYYYMMDD
        const year = cleanDate.substring(0, 4);
        const month = cleanDate.substring(4, 6);
        const day = cleanDate.substring(6, 8);
        
        let hours = 0;
        let minutes = 0;
        let seconds = 0;

        if (cleanDate.includes('T')) {
            const timePart = cleanDate.split('T')[1].replace('Z', '');
            hours = parseInt(timePart.substring(0, 2)) || 0;
            minutes = parseInt(timePart.substring(2, 4)) || 0;
            seconds = parseInt(timePart.substring(4, 6)) || 0;
        }

        // Return ISO string
        return new Date(year, month - 1, day, hours, minutes, seconds).toISOString();
    };

    lines.forEach(line => {
        const separatorIndex = line.indexOf(':');
        const rawName = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
        const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
        const [name, ...params] = rawName.split(';');
        const isAllDay = params.some(param => param.toUpperCase() === 'VALUE=DATE');

        if (line.startsWith('BEGIN:VEVENT')) {
            currentEvent = {};
        } else if (line.startsWith('END:VEVENT')) {
            if (currentEvent && currentEvent.title && currentEvent.date) {
                const dedupeKey = currentEvent.externalId || `${currentEvent.title}:${currentEvent.date}`;
                if (!seen.has(dedupeKey)) {
                    seen.add(dedupeKey);
                    events.push({
                    id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
                    source: 'ics',
                    ...currentEvent
                    });
                }
            }
            currentEvent = null;
        } else if (currentEvent) {
            if (name === 'UID') {
                currentEvent.externalId = rawValue;
            } else if (name === 'SUMMARY') {
                currentEvent.title = rawValue.replace(/\\,/g, ',').replace(/\\n/g, '\n');
            } else if (name === 'DESCRIPTION') {
                currentEvent.description = rawValue.replace(/\\,/g, ',').replace(/\\n/g, '\n');
            } else if (name === 'DTSTART') {
                currentEvent.date = parseDate(rawValue);
                currentEvent.allDay = isAllDay;
            } else if (name === 'DTEND') {
                currentEvent.endDate = parseDate(rawValue);
                if (currentEvent.date && currentEvent.endDate) {
                    const diff = new Date(currentEvent.endDate) - new Date(currentEvent.date);
                    currentEvent.durationMinutes = Math.max(1, Math.round(diff / 60000));
                }
            } else if (name === 'RRULE') {
                const rules = rawValue.split(';');
                const freqRule = rules.find(r => r.startsWith('FREQ='));
                if (freqRule) {
                    const freq = freqRule.substring(5).toUpperCase();
                    if (freq === 'DAILY') currentEvent.recurrence = 'daily';
                    else if (freq === 'WEEKLY') currentEvent.recurrence = 'weekly';
                    else if (freq === 'MONTHLY') currentEvent.recurrence = 'monthly';
                    else if (freq === 'YEARLY') currentEvent.recurrence = 'yearly';
                }
            }
        }
    });

    return events;
}
