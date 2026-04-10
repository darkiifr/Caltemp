export function getOccurrencesOnDate(events, targetDate) {
    const targetY = targetDate.getFullYear();
    const targetM = targetDate.getMonth();
    const targetD = targetDate.getDate();

    const targetStartOfDay = new Date(targetY, targetM, targetD).getTime();

    const result = [];

    for (const event of events) {
        const evDate = new Date(event.date);
        const y = evDate.getFullYear();
        const m = evDate.getMonth();
        const d = evDate.getDate();

        const evStartOfDay = new Date(y, m, d).getTime();
        
        // Event cannot occur before its initial start date
        if (targetStartOfDay < evStartOfDay) {
            continue;
        }

        let occurs = false;
        if (!event.recurrence || event.recurrence === 'none') {
            occurs = (targetStartOfDay === evStartOfDay);
        } else if (event.recurrence === 'daily') {
            occurs = true;
        } else if (event.recurrence === 'weekly') {
            // Same day of week
            const diffTime = targetStartOfDay - evStartOfDay;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            occurs = (diffDays % 7 === 0);
        } else if (event.recurrence === 'monthly') {
            // Same day of month, but handle shorter months
            const daysInTargetMonth = new Date(targetY, targetM + 1, 0).getDate();
            const targetDay = Math.min(d, daysInTargetMonth);
            occurs = (targetD === targetDay);
        } else if (event.recurrence === 'yearly') {
            // Same month and day, handle leap years
            const isLeapYear = new Date(targetY, 1, 29).getDate() === 29;
            const targetDay = (m === 1 && d === 29 && !isLeapYear) ? 28 : d;
            occurs = (targetM === m && targetD === targetDay);
        }

        if (occurs) {
            // Map the event date to the target date visually
            const occurrenceDate = new Date(targetDate);
            occurrenceDate.setHours(evDate.getHours(), evDate.getMinutes(), evDate.getSeconds(), 0);
            
            result.push({
                ...event,
                date: occurrenceDate.toISOString(),
                originalDate: event.date // keep original just in case
            });
        }
    }

    return result;
}

export function getNextOccurrence(event, now = new Date()) {
    const evDate = new Date(event.date);
    
    // If it hasn't happened yet, the next occurrence is simply the base date
    if (evDate >= now) {
        return evDate;
    }

    // If it has no recurrence and is already passed
    if (!event.recurrence || event.recurrence === 'none') {
        return null;
    }

    // We need to find the earliest occurrence that is >= now
    const nowY = now.getFullYear();
    const nowM = now.getMonth();
    const nowD = now.getDate();

    let candidate = new Date(nowY, nowM, nowD, evDate.getHours(), evDate.getMinutes(), evDate.getSeconds());

    // If candidate today is already strictly before 'now', start from tomorrow
    // EXCEPT if we want to allow catching reminders slightly after they pass, we can just return candidate.
    // Let's ensure candidate is strictly > now or at least >= now.
    if (candidate < now) {
        candidate.setDate(candidate.getDate() + 1);
    }

    // Now adjust to match recurrence rules
    while (true) {
        let isValid = false;
        if (event.recurrence === 'daily') {
            isValid = true;
        } else if (event.recurrence === 'weekly') {
            isValid = candidate.getDay() === evDate.getDay();
        } else if (event.recurrence === 'monthly') {
            const daysInMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
            const targetDay = Math.min(evDate.getDate(), daysInMonth);
            isValid = candidate.getDate() === targetDay;
        } else if (event.recurrence === 'yearly') {
            const isLeapYear = new Date(candidate.getFullYear(), 1, 29).getDate() === 29;
            const targetMonth = evDate.getMonth();
            const targetDay = (targetMonth === 1 && evDate.getDate() === 29 && !isLeapYear) ? 28 : evDate.getDate();
            isValid = candidate.getMonth() === targetMonth && candidate.getDate() === targetDay;
        }

        if (isValid) return candidate;

        // Increment by 1 day and try again
        candidate.setDate(candidate.getDate() + 1);
    }
}
