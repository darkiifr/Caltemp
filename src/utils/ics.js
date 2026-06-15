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
    const lines = icsContent.split(/\r\n|\n|\r/);
    let currentEvent = null;

    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        // Format: YYYYMMDDTHHmmssZ or YYYYMMDD
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        
        let hours = 0;
        let minutes = 0;
        let seconds = 0;

        if (dateStr.includes('T')) {
            const timePart = dateStr.split('T')[1].replace('Z', '');
            hours = parseInt(timePart.substring(0, 2)) || 0;
            minutes = parseInt(timePart.substring(2, 4)) || 0;
            seconds = parseInt(timePart.substring(4, 6)) || 0;
        }

        // Return ISO string
        return new Date(year, month - 1, day, hours, minutes, seconds).toISOString();
    };

    lines.forEach(line => {
        if (line.startsWith('BEGIN:VEVENT')) {
            currentEvent = {};
        } else if (line.startsWith('END:VEVENT')) {
            if (currentEvent && currentEvent.title && currentEvent.date) {
                events.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    ...currentEvent
                });
            }
            currentEvent = null;
        } else if (currentEvent) {
            if (line.startsWith('SUMMARY:')) {
                currentEvent.title = line.substring(8);
            } else if (line.startsWith('DESCRIPTION:')) {
                currentEvent.description = line.substring(12);
            } else if (line.startsWith('DTSTART:')) {
                currentEvent.date = parseDate(line.substring(8));
            } else if (line.startsWith('DTSTART;')) {
                // Handle cases with timezone params like DTSTART;TZID=...:
                const datePart = line.split(':')[1];
                currentEvent.date = parseDate(datePart);
            } else if (line.startsWith('RRULE:')) {
                const rules = line.substring(6).split(';');
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
