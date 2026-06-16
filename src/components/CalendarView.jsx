import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { getHolidays } from '../utils/holidays';
import DayDetails from './DayDetails';
import { playBubbleSound } from '../utils/sound';
import { getOccurrencesOnDate } from '../utils/eventUtils';
import { buildStats } from '../domain/planning';
import { formatEventDate, DEFAULT_CATEGORY_LEGEND } from '../domain/events';

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const AGENDA_WINDOW_DAYS = 45;
const FOCUS_WINDOW_DAYS = 14;

export default function CalendarView({ events, settings = {}, onAddEvent, onEditEvent, onDeleteEvent, showHolidays = true, showNamedays = true }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [view, setView] = useState('month'); // 'year', 'month', 'week', 'day', 'agenda', 'focus', 'stats'
    const [direction, setDirection] = useState('right');
    const [now, setNow] = useState(new Date());
    const dayScrollRef = useRef(null);

    // Update 'now' every minute for the red line, only if the app is not hidden
    useEffect(() => {
        const interval = setInterval(() => {
            if (!document.hidden) {
                setNow(new Date());
            }
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    // Scroll to current time on view change to 'day'
    useEffect(() => {
        if (view === 'day' && dayScrollRef.current) {
             // Scroll to 2 hours before now, or 8am if morning
             const h = now.getHours();
             const scrollInPx = Math.max(0, (h - 2) * 80); 
             dayScrollRef.current.scrollTop = scrollInPx;
        }
    }, [view, now]);

    // Holidays memo (year based)
    const holidays = useMemo(() => {
        return showHolidays ? getHolidays(currentDate.getFullYear()) : [];
    }, [currentDate, showHolidays]);

    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        return { days, firstDay };
    };

    const isToday = (date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    const isSameDay = (d1, d2) => {
        return d1.getDate() === d2.getDate() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getFullYear() === d2.getFullYear();
    };

    const getEventsForDay = (date) => {
        return getOccurrencesOnDate(events, date);
    };

    const categoryLegend = settings.categoryLegend || DEFAULT_CATEGORY_LEGEND;

    // Navigation
    const navigate = (dir) => {
        playBubbleSound();
        setDirection(dir === 1 ? 'right' : 'left');
        const newDate = new Date(currentDate);

        if (view === 'year') {
            newDate.setFullYear(newDate.getFullYear() + dir);
        } else if (view === 'month') {
            newDate.setMonth(newDate.getMonth() + dir);
        } else if (view === 'week') {
            newDate.setDate(newDate.getDate() + (dir * 7));
        } else if (view === 'day') {
            newDate.setDate(newDate.getDate() + dir);
        } else if (view === 'agenda') {
            newDate.setDate(newDate.getDate() + (dir * AGENDA_WINDOW_DAYS));
        } else if (view === 'focus') {
            newDate.setDate(newDate.getDate() + (dir * FOCUS_WINDOW_DAYS));
        } else if (view === 'stats') {
            newDate.setDate(newDate.getDate() + (dir * 7));
        }
        setCurrentDate(newDate);
        // Sync selected date roughly to keep context? Or keep it independent?
        // Usually keeping separate is better, but maybe update selected if it falls out of view??
        // Let's keep selectedDate independent unless clicked.
    };

    // Zoom/View Control
    const zoomOut = () => {
        if (view === 'day') setView('week');
        else if (view === 'week') setView('month');
        else if (view === 'month') setView('year');
    };

    const zoomIn = (targetDate, targetView) => {
        if (targetDate) {
            setCurrentDate(targetDate);
            setSelectedDate(targetDate);
        }
        if (targetView) setView(targetView);
    };

    // Renderers
    const renderHeader = () => {
        let title = '';
        let subtitle = '';
        if (view === 'year') title = `${currentDate.getFullYear()}`;
        else if (view === 'month') title = `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        else if (view === 'week') {
            // Week range
            const startOfWeek = new Date(currentDate);
            startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            
            // Format: "Jan 1 - Jan 7, 2024" or similiar
            const m1 = MONTHS[startOfWeek.getMonth()].substring(0, 3);
            const m2 = MONTHS[endOfWeek.getMonth()].substring(0, 3);
            if (m1 === m2) title = `${m1} ${startOfWeek.getDate()} - ${endOfWeek.getDate()}, ${startOfWeek.getFullYear()}`;
            else title = `${m1} ${startOfWeek.getDate()} - ${m2} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
        }
        else if (view === 'day') {
            title = `${DAYS[currentDate.getDay()]} ${currentDate.getDate()} ${MONTHS[currentDate.getMonth()]}`;
        } else if (view === 'agenda') {
            title = 'Agenda';
            const end = new Date(currentDate);
            end.setDate(currentDate.getDate() + AGENDA_WINDOW_DAYS - 1);
            subtitle = `${formatEventDate(currentDate, settings, { includeTime: false })} - ${formatEventDate(end, settings, { includeTime: false })}`;
        } else if (view === 'focus') {
            title = 'Mode focus';
            const end = new Date(currentDate);
            end.setDate(currentDate.getDate() + FOCUS_WINDOW_DAYS - 1);
            subtitle = `Priorités du ${formatEventDate(currentDate, settings, { includeTime: false })} au ${formatEventDate(end, settings, { includeTime: false })}`;
        } else if (view === 'stats') {
            title = 'Statistiques';
            const startOfWeek = new Date(currentDate);
            startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            subtitle = `Semaine du ${formatEventDate(startOfWeek, settings, { includeTime: false })} au ${formatEventDate(endOfWeek, settings, { includeTime: false })}`;
        }

        return (
            <div className="flex justify-between items-center mb-4 shrink-0">
                <div 
                    key={`${view}-${currentDate.toString()}`} 
                    className={`cursor-pointer hover:opacity-80 transition-opacity ${direction === 'right' ? 'animate-month-right' : 'animate-month-left'}`}
                    onClick={zoomOut}
                    title={view !== 'year' ? "Zoomer arrière" : ""}
                >
                    <h2 className="text-2xl font-bold tracking-tight">
                        {title}
                    </h2>
                    {subtitle && (
                        <div className="mt-1 text-xs font-medium text-white/40">
                            {subtitle}
                        </div>
                    )}
                </div>
                <div className="flex gap-2 items-center">
                    <div className="bg-white/5 p-1 rounded-xl flex items-center mr-2 border border-white/5 shadow-inner">
                        {['year', 'month', 'week', 'day', 'agenda', 'focus', 'stats'].map((v) => (
                           <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                                    view === v ? 'bg-white/15 text-white shadow-sm' : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                                }`}
                           >
                               {v === 'year' ? 'Année' : v === 'month' ? 'Mois' : v === 'week' ? 'Semaine' : v === 'day' ? 'Jour' : v === 'agenda' ? 'Agenda' : v === 'focus' ? 'Focus' : 'Stats'}
                           </button> 
                        ))}
                    </div>

                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <ChevronLeft size={20} />
                    </button>
                    <button
                        onClick={() => {
                            const now = new Date();
                            setCurrentDate(now);
                            setSelectedDate(now);
                            if (view === 'day' && !isSameDay(now, currentDate)) {
                                // Already handled by state update
                            }
                        }}
                        className="px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                    >
                        Auj.
                    </button>
                    <button onClick={() => navigate(1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>
        );
    };

    const renderYearView = () => (
        <div className={`grid grid-cols-4 gap-4 flex-1 overflow-y-auto content-start p-2 ${direction === 'right' ? 'animate-month-right' : 'animate-month-left'}`}>
            {MONTHS.map((monthName, monthIndex) => {
                const isCurrentMonth = monthIndex === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear();
                const daysInMonth = new Date(currentDate.getFullYear(), monthIndex + 1, 0).getDate();
                const firstDayOfMonth = new Date(currentDate.getFullYear(), monthIndex, 1).getDay(); // 0 is Sunday
                
                return (
                    <div 
                        key={monthName}
                        onClick={() => {
                            const d = new Date(currentDate.getFullYear(), monthIndex, 1);
                            zoomIn(d, 'month');
                        }}
                        className={`
                            p-3 rounded-xl border bg-white/5 hover:bg-white/10 cursor-pointer transition-all flex flex-col gap-2
                            ${isCurrentMonth ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/5'}
                        `}
                    >
                        <span className={`text-sm font-bold ${isCurrentMonth ? 'text-blue-400' : 'text-white/90'}`}>
                            {monthName}
                        </span>
                        
                        <div className="grid grid-cols-7 gap-1 text-[8px] text-center">
                             {/* Days Header */}
                            {['D','L','M','M','J','V','S'].map((d, i) => (
                                <div key={i} className="text-white/30">{d}</div>
                            ))}
                            
                            {/* Empty cells */}
                            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                                <div key={`e-${i}`} />
                            ))}
                            
                            {/* Days */}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                const dayNum = i + 1;
                                // Performance: Avoid full filter for every day in year view if possible, or accept it for now.
                                // 365 iterations * N events might be slow if many events.
                                // Minimal indicator:
                                const targetDate = new Date(currentDate.getFullYear(), monthIndex, dayNum);
                                const hasEvent = getOccurrencesOnDate(events, targetDate).length > 0;
                                
                                return (
                                    <div key={dayNum} className={`aspect-square flex items-center justify-center rounded-sm ${hasEvent ? 'bg-white/20' : ''}`}>
                                        <span className={hasEvent ? 'text-white' : 'text-white/50'}>{dayNum}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    const renderMonthView = () => {
        const { days, firstDay } = getDaysInMonth(currentDate);
        const totalSlots = firstDay + days;
        const totalRows = Math.ceil(totalSlots / 7);

        return (
            <div className={`flex flex-col h-full gap-2 p-4 overflow-hidden ${direction === 'right' ? 'animate-month-right' : 'animate-month-left'}`}>
                {/* Days Header */}
                <div className="grid grid-cols-7 gap-2 mb-2 shrink-0">
                    {DAYS.map((day, i) => (
                        <div key={i} className="text-center text-sm font-semibold text-white/50">{day}</div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className="flex-1 grid grid-cols-7 gap-2 overflow-y-auto custom-scrollbar" style={{ gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))` }}>
                    {Array.from({ length: totalRows * 7 }).map((_, i) => {
                        const dayNumber = i - firstDay + 1;
                        const isCurrentMonth = dayNumber > 0 && dayNumber <= days;
                        
                        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNumber);
                        const isTodayDate = isCurrentMonth && isToday(date);
                        const isSelectedDate = isCurrentMonth && isSameDay(date, selectedDate);
                        
                        // Check events
                        const dayEvents = isCurrentMonth ? getEventsForDay(date) : [];

                        return (
                            <div 
                                key={i}
                                onClick={() => {
                                    if (isCurrentMonth) {
                                        setSelectedDate(date);
                                    }
                                }}
                                onDoubleClick={() => {
                                    if (isCurrentMonth) {
                                        zoomIn(date, 'day');
                                    }
                                }}
                                className={`
                                    flex flex-col rounded-xl p-2 transition-all cursor-pointer border
                                    ${!isCurrentMonth ? 'opacity-30 pointer-events-none border-transparent' : ''}
                                    ${isSelectedDate ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}
                                    ${isTodayDate ? 'border-blue-500/50 shadow-[inset_0_0_15px_rgba(59,130,246,0.15)]' : ''}
                                `}
                            >
                                <div className="flex justify-end mb-1">
                                    <span className={`
                                        w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold
                                        ${isTodayDate ? 'bg-blue-500 text-white' : 'text-white/80'}
                                    `}>
                                        {date.getDate()}
                                    </span>
                                </div>
                                
                                <div className="flex-1 flex flex-col gap-1 overflow-visible">
                                     {dayEvents.slice(0, 3).map((ev, idx) => (
                                         <div
                                            key={idx}
                                            className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded truncate shadow-sm border"
                                            style={{
                                                backgroundColor: `${ev.color || '#3b82f6'}26`,
                                                borderColor: `${ev.color || '#3b82f6'}66`,
                                                color: '#f8fafc',
                                            }}
                                         >
                                             {ev.title}
                                         </div>
                                     ))}
                                     {dayEvents.length > 3 && (
                                         <div className="text-[10px] text-white/50 font-medium px-1">
                                             +{dayEvents.length - 3} autres
                                         </div>
                                     )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderWeekView = () => {
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
        
        return (
            <div className={`flex h-full gap-3 overflow-hidden flex-1 ${direction === 'right' ? 'animate-month-right' : 'animate-month-left'}`}>
                {Array.from({ length: 7 }).map((_, i) => {
                    const date = new Date(startOfWeek);
                    date.setDate(startOfWeek.getDate() + i);
                    const isTodayDate = isToday(date);
                    const isSelectedDate = isSameDay(date, selectedDate);
                    const dayEvents = getEventsForDay(date);

                    return (
                        <div 
                            key={i} 
                            onClick={() => { setSelectedDate(date); }}
                            className={`flex-1 flex flex-col rounded-2xl transition-colors ${isSelectedDate ? 'bg-white/5 shadow-inner' : 'hover:bg-white/[0.02]'}`}
                        >
                            <div className={`text-center py-4 flex flex-col items-center justify-center gap-1 ${isTodayDate ? 'text-blue-400' : 'text-white/70'}`}>
                                <div className="text-sm font-medium">{DAYS[date.getDay()]}</div>
                                <div className={`text-2xl font-bold flex items-center justify-center w-10 h-10 rounded-full transition-colors ${isTodayDate ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : ''}`}>
                                    {date.getDate()}
                                </div>
                            </div>
                            
                            <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
                                {dayEvents.map(event => (
                                    <div 
                                        key={event.id} 
                                        onClick={(e) => { e.stopPropagation(); onEditEvent(event); }}
                                        className="px-3 py-2 rounded-xl text-sm cursor-pointer transition-colors shadow-sm border hover:brightness-125"
                                        style={{
                                            backgroundColor: `${event.color || '#3b82f6'}26`,
                                            borderColor: `${event.color || '#3b82f6'}66`,
                                        }}
                                    >
                                        <div className="font-semibold text-blue-200">
                                            {event.title}
                                        </div>
                                        <div className="text-xs text-blue-300/80 font-medium mt-0.5">
                                            {new Date(event.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </div>
                                    </div>
                                ))}
                                
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const d = new Date(date);
                                        d.setHours(9, 0, 0, 0);
                                        onAddEvent(d);
                                    }}
                                    className="w-full py-2 mt-1 flex items-center justify-center text-white/30 text-xs hover:text-white/80 hover:bg-white/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 sm:opacity-100"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderDayView = () => {
        const date = currentDate;
        const events = getEventsForDay(date); // Not sorted by time strictly needed for rendering, but good to have
        const isTodayView = isSameDay(date, now);
        const HOUR_HEIGHT = 80;

        return (
            <div className={`flex flex-col h-full overflow-hidden ${direction === 'right' ? 'animate-month-right' : 'animate-month-left'}`}>
                {/* Header Actions for Day View */}
                <div className="flex justify-end px-4 pb-2">
                     <button
                        onClick={() => {
                            const d = new Date(currentDate);
                            d.setHours(new Date().getHours() + 1, 0, 0, 0); 
                            onAddEvent(d);
                        }}
                        className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 px-3 py-1 rounded-full transition-colors"
                    >
                        <Plus size={14} /> Nouvel événement
                    </button>
                </div>

                <div ref={dayScrollRef} className="relative flex-1 overflow-y-auto custom-scrollbar bg-black/20 rounded-xl mx-4 mb-4">
                    <div className="relative w-full" style={{ height: 24 * HOUR_HEIGHT }}>
                        {/* Grid Lines & Hours */}
                        {Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className="absolute w-full group" style={{ top: i * HOUR_HEIGHT }}>
                                {/* Hour Label */}
                                <div className="absolute -top-3 left-4 w-12 text-right text-xs font-medium text-white/30 group-hover:text-white/50 transition-colors">
                                    {i}:00
                                </div>
                                {/* Divider Line */}
                                <div className="absolute top-0 left-20 right-0 border-t border-white/5 group-hover:border-white/10" />
                            </div>
                        ))}

                        {/* Events */}
                        {events.map(event => {
                            const d = new Date(event.date);
                            const startMin = d.getHours() * 60 + d.getMinutes();
                            const durationMin = 60; // Default duration of 1 hour 
                            const top = (startMin / 60) * HOUR_HEIGHT;
                            const height = (durationMin / 60) * HOUR_HEIGHT;

                            return (
                                <div
                                    key={event.id}
                                    onDoubleClick={(e) => { e.stopPropagation(); onEditEvent(event); }}
                                    className="absolute left-[90px] right-4 rounded-lg border-l-[3px] px-3 py-2 cursor-pointer hover:z-20 transition-all overflow-hidden group select-none z-10 shadow-sm backdrop-blur-[1px]"
                                    style={{
                                        top: `${top}px`,
                                        height: `${height - 2}px`,
                                        backgroundColor: `${event.color || '#3b82f6'}26`,
                                        borderColor: event.color || '#3b82f6',
                                    }}
                                    title={`${event.title} (${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`}
                                >
                                    <div className="flex flex-col h-full pl-0.5">
                                        <div className="flex items-baseline gap-2 mb-0.5">
                                            <h4 className="font-bold text-white text-sm leading-tight truncate">
                                                {event.title}
                                            </h4>
                                            <span className="text-[11px] font-medium text-blue-200/80">
                                                {d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                        </div>
                                        {event.description && (
                                            <p className="text-white/60 text-xs mt-0.5 line-clamp-2 leading-relaxed">
                                                {event.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Current Time Indicator Red Line */}
                        {isTodayView && (
                            <div 
                                className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                                style={{ top: (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT }}
                            >
                                {/* Floating Time Label */}
                                <div className="absolute left-2 w-[70px] text-right transform -translate-y-1/2 pr-2">
                                    <span className="text-[11px] font-bold text-red-100 bg-red-600 px-2 py-0.5 rounded-full shadow-md">
                                        {now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                                
                                {/* The Line */}
                                <div className="absolute left-20 right-0 h-[1px] bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]">
                                    <div className="absolute -left-[5px] -top-[4px] w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm border border-[#121212]" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const getUpcomingEvents = (days = 30) => {
        const upcoming = [];
        const start = new Date(currentDate);
        start.setHours(0, 0, 0, 0);
        for (let offset = 0; offset < days; offset += 1) {
            const date = new Date(start);
            date.setDate(start.getDate() + offset);
            upcoming.push(...getEventsForDay(date));
        }
        return upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
    };

    const renderAgendaView = () => {
        const agendaDays = Array.from({ length: AGENDA_WINDOW_DAYS }, (_, offset) => {
            const date = new Date(currentDate);
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + offset);
            return {
                date,
                events: getEventsForDay(date).sort((a, b) => new Date(a.date) - new Date(b.date)),
            };
        }).filter(day => day.events.length > 0);

        return (
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
                {agendaDays.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-white/40">Aucun événement sur cette période.</div>
                ) : (
                    <div className="mx-auto grid w-full max-w-4xl gap-5">
                        <div className="rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3 text-sm text-white/55">
                            Vue liste : seuls les jours avec événements sont affichés, à partir de la date sélectionnée.
                        </div>
                        {agendaDays.map(day => (
                            <section key={day.date.toISOString()} className="grid gap-2">
                                <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-white/35">
                                    <span className="h-px flex-1 bg-white/10" />
                                    <span>{day.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                                    <span className="h-px flex-1 bg-white/10" />
                                </div>
                                <div className="grid gap-2">
                                    {day.events.map(event => (
                                        <button
                                            key={`${event.id}-${event.date}`}
                                            onClick={() => onEditEvent(event)}
                                            className="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors flex items-center gap-4"
                                        >
                                            <div className="w-1.5 self-stretch rounded-full" style={{ backgroundColor: event.color || categoryLegend[event.category]?.color || '#60a5fa' }} />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-white truncate">{event.title}</div>
                                                <div className="text-xs text-white/50 mt-1">
                                                    {new Date(event.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                            <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 text-white/60">
                                                {categoryLegend[event.category]?.label || event.category}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderFocusView = () => {
        const focusEvents = getUpcomingEvents(FOCUS_WINDOW_DAYS);
        const start = new Date(currentDate);
        start.setHours(0, 0, 0, 0);
        const limitFor = (days) => {
            const date = new Date(start);
            date.setDate(start.getDate() + days);
            return date;
        };
        const sections = [
            {
                title: 'Maintenant',
                hint: 'Dans les 48 prochaines heures',
                events: focusEvents.filter(event => new Date(event.date) < limitFor(2)),
            },
            {
                title: 'Cette semaine',
                hint: 'De J+2 à J+7',
                events: focusEvents.filter(event => new Date(event.date) >= limitFor(2) && new Date(event.date) < limitFor(7)),
            },
            {
                title: 'À anticiper',
                hint: 'J+7 à J+14',
                events: focusEvents.filter(event => new Date(event.date) >= limitFor(7)),
            },
        ];

        return (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-3">
                    {sections.map((section, sectionIndex) => (
                        <section key={section.title} className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
                            <div className="mb-4">
                                <h3 className="text-base font-semibold text-white">{section.title}</h3>
                                <p className="mt-1 text-xs text-white/40">{section.hint}</p>
                            </div>
                            <div className="grid gap-3">
                                {section.events.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/35">
                                        Rien à gérer dans ce bloc.
                                    </div>
                                ) : section.events.map((event, index) => (
                                    <button
                                        key={`${event.id}-${event.date}`}
                                        onClick={() => onEditEvent(event)}
                                        className={`text-left rounded-xl border p-4 transition-colors ${sectionIndex === 0 && index === 0 ? 'bg-white/12 border-white/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="w-3 h-3 shrink-0 rounded-full" style={{ backgroundColor: event.color || categoryLegend[event.category]?.color || '#60a5fa' }} />
                                            <span className="text-xs uppercase tracking-widest text-white/40">{formatEventDate(event.date, settings)}</span>
                                        </div>
                                        <div className="mt-3 text-lg font-semibold text-white">{event.title}</div>
                                        {event.description && <p className="mt-2 line-clamp-3 text-sm text-white/50">{event.description}</p>}
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        );
    };

    const renderStatsView = () => {
        const stats = buildStats(events, currentDate);
        const maxLoad = Math.max(1, ...stats.days.map(day => day.load));
        const totalEvents = Object.values(stats.byCategory).reduce((sum, count) => sum + count, 0);
        const totalHours = Math.round(stats.days.reduce((sum, day) => sum + day.load, 0) / 60);
        const busiestDay = stats.days.reduce((best, day) => day.load > best.load ? day : best, stats.days[0]);
        const maxCategory = Math.max(1, ...Object.values(stats.byCategory));
        return (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/5 bg-white/[0.06] p-4">
                        <div className="text-xs uppercase tracking-widest text-white/35">Événements</div>
                        <div className="mt-2 text-3xl font-bold text-white">{totalEvents}</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.06] p-4">
                        <div className="text-xs uppercase tracking-widest text-white/35">Charge</div>
                        <div className="mt-2 text-3xl font-bold text-white">{totalHours} h</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.06] p-4">
                        <div className="text-xs uppercase tracking-widest text-white/35">Jour le plus dense</div>
                        <div className="mt-2 text-lg font-semibold text-white">
                            {new Date(busiestDay.date).toLocaleDateString('fr-FR', { weekday: 'long' })}
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="text-sm uppercase tracking-widest text-white/40 mb-3">Charge de la semaine</h3>
                    <div className="grid grid-cols-7 gap-2 rounded-2xl border border-white/5 bg-black/20 p-3">
                        {stats.days.map(day => (
                            <div key={day.date} className="rounded-xl border border-white/5 bg-white/5 p-3 min-h-32 flex flex-col justify-between">
                                <div>
                                    <span className="text-xs text-white/40">{new Date(day.date).toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
                                    <div className="mt-1 text-sm font-semibold text-white">{new Date(day.date).getDate()}</div>
                                </div>
                                <div
                                    className="h-14 rounded-lg transition-all shadow-inner"
                                    style={{
                                        backgroundColor: `rgba(59, 130, 246, ${0.15 + (day.load / maxLoad) * 0.65})`,
                                        boxShadow: day.load ? 'inset 0 0 22px rgba(255,255,255,0.08)' : undefined,
                                    }}
                                />
                                <span className="text-xs text-white/70">{Math.round(day.load / 60)} h · {day.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <h3 className="text-sm uppercase tracking-widest text-white/40 mb-3">Répartition</h3>
                    <div className="grid gap-3">
                        {Object.entries(categoryLegend).map(([key, meta]) => (
                            <div key={key} className="rounded-xl border border-white/5 bg-white/5 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                                        <span className="truncate text-sm text-white">{meta.label}</span>
                                    </div>
                                    <span className="text-sm font-semibold text-white/80">{stats.byCategory[key] || 0}</span>
                                </div>
                                <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: `${((stats.byCategory[key] || 0) / maxCategory) * 100}%`,
                                            backgroundColor: meta.color,
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const { events: selectedEvents, holiday: selectedHoliday } = useMemo(() => {
        const day = selectedDate.getDate();
        const dEvents = getOccurrencesOnDate(events, selectedDate);
        
        let dHoliday = null;
        if (showHolidays) {
            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const dayStr = String(day).padStart(2, '0');
            const dateStr = `${year}-${month}-${dayStr}`;
            // Simple lookup in current holiday list (might be inaccurate if year differs)
            // But good enough for consistent UI
            dHoliday = holidays.find(h => h.date === dateStr);
        }
        return { events: dEvents, holiday: dHoliday };
    }, [selectedDate, events, showHolidays, holidays]);

    return (
        <div className="flex h-full bg-transparent text-white overflow-hidden">
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
                {renderHeader()}
                
                {view === 'year' && renderYearView()}
                {view === 'month' && renderMonthView()}
                {view === 'week' && renderWeekView()}
                {view === 'day' && renderDayView()}
                {view === 'agenda' && renderAgendaView()}
                {view === 'focus' && renderFocusView()}
                {view === 'stats' && renderStatsView()}
            </div>

            {/* Day Details Panel - Hide in Day View to avoid duplication, OR keep it? 
                User might want consistent layout. Let's keep it visible except maybe in Day view where it's redundant?
                Actually, the Day View above is just a center list. 
                Let's hide the side panel in Day View to give more space.
            */}
            {!['day', 'agenda', 'focus', 'stats'].includes(view) && (
                <DayDetails
                    date={selectedDate}
                    events={selectedEvents}
                    holiday={selectedHoliday}
                    showNamedays={showNamedays}
                    onEditEvent={onEditEvent}
                    onDeleteEvent={onDeleteEvent}
                />
            )}
        </div>
    );
}
