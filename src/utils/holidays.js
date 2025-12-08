
export function getHolidays(year) {
    const holidays = [
        { date: `${year}-01-01`, name: "Jour de l'An" },
        { date: `${year}-05-01`, name: "Fête du Travail" },
        { date: `${year}-05-08`, name: "Victoire 1945" },
        { date: `${year}-07-14`, name: "Fête Nationale" },
        { date: `${year}-08-15`, name: "Assomption" },
        { date: `${year}-11-01`, name: "Toussaint" },
        { date: `${year}-11-11`, name: "Armistice 1918" },
        { date: `${year}-12-25`, name: "Noël" },
    ];

    // Pâques (Algorithme de Meeus/Jones/Butcher)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    const easterDate = new Date(year, month - 1, day);
    
    // Lundi de Pâques (Pâques + 1 jour)
    const easterMonday = new Date(easterDate);
    easterMonday.setDate(easterMonday.getDate() + 1);
    holidays.push({ 
        date: easterMonday.toISOString().split('T')[0], 
        name: "Lundi de Pâques" 
    });

    // Ascension (Pâques + 39 jours)
    const ascension = new Date(easterDate);
    ascension.setDate(ascension.getDate() + 39);
    holidays.push({ 
        date: ascension.toISOString().split('T')[0], 
        name: "Ascension" 
    });

    // Lundi de Pentecôte (Pâques + 50 jours)
    const pentecost = new Date(easterDate);
    pentecost.setDate(pentecost.getDate() + 50);
    holidays.push({ 
        date: pentecost.toISOString().split('T')[0], 
        name: "Lundi de Pentecôte" 
    });

    return holidays;
}

export function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export function getYearDetails(year) {
    const isLeap = isLeapYear(year);
    const days = isLeap ? 366 : 365;
    return {
        year,
        isLeap,
        days
    };
}
