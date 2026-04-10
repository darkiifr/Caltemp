import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { getHolidays } from '../utils/holidays';
import DayDetails from './DayDetails';
import { playBubbleSound } from '../utils/sound';
import { getOccurrencesOnDate } from '../utils/eventUtils';

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return weekNo;
};

export default function CalendarView({ events, onAddEvent, onEditEvent, onDeleteEvent, showHolidays = true, showNamedays = true }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [view, setView] = useState('month'); // 'year', 'month', 'week', 'day'
    const [direction, setDirection] = useState('right');
    const [now, setNow] = useState(new Date());
    const dayScrollRef = useRef(null);

    // Update 'now' every minute for the red line
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
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
                </div>
                <div className="flex gap-2 items-center">
                    <div className="bg-white/10 rounded-lg p-1 flex items-center mr-2">
                        {['year', 'month', 'week', 'day'].map((v) => (
                           <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                    view === v ? 'bg-blue-500 text-white shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/5'
                                }`}
                           >
                               {v === 'year' ? 'An' : v === 'month' ? 'Mois' : v === 'week' ? 'Sem' : 'Jour'}
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
                                // Basic check for events
                                const dateStr = new Date(currentDate.getFullYear(), monthIndex, dayNum).toDateString();
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
            <div className={`flex flex-col gap-4 p-4 overflow-y-auto h-full ${direction === 'right' ? 'animate-month-right' : 'animate-month-left'}`}>
                {Array.from({ length: totalRows }).map((_, rowIndex) => {
                    // Calculate start of the week (Sunday)
                    const startOfWeek = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1 - firstDay + (rowIndex * 7));
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setDate(startOfWeek.getDate() + 6);

                    // Calculate week number using Thursday
                    const checkDate = new Date(startOfWeek);
                    checkDate.setDate(checkDate.getDate() + 4);
                    const weekNum = getWeekNumber(checkDate);
                    
                    // Check if current week (contains today)
                    const today = new Date();
                    const isCurrentWeek = today >= startOfWeek && today <= endOfWeek;

                    return (
                        <div 
                            key={rowIndex}
                            onClick={() => {
                                playBubbleSound();
                                // We zoom into the week. 
                                // To act like "zoomIn", we often set view AND date.
                                // We might want to set selectedDate to Monday or today if in range?
                                // Let's simplify: Set date to startOfWeek (or keep it simple) and view to week.
                                zoomIn(startOfWeek, 'week');
                            }}
                            className={`
                                flex items-center justify-between p-6 rounded-2xl border cursor-pointer transition-all duration-200 group
                                ${isCurrentWeek 
                                    ? 'bg-blue-500/20 border-blue-500/50 hover:bg-blue-500/30' 
                                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'}
                            `}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`
                                    w-12 h-12 flex items-center justify-center rounded-full text-xl font-bold
                                    ${isCurrentWeek ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/50 group-hover:bg-white/20 group-hover:text-white'}
                                `}>
                                    {weekNum}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-lg font-semibold tracking-wide">Semaine {weekNum}</span>
                                    <span className="text-sm text-white/50">
                                        Du {startOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au {endOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white/50">
                                <ChevronRight />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderWeekView = () => {
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
        
        return (
            <div className={`grid grid-cols-7 gap-2 h-full overflow-hidden flex-1 ${direction === 'right' ? 'animate-month-right' : 'animate-month-left'}`}>
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
                            className={`flex flex-col border-r h-full ${i === 6 ? 'border-r-0' : 'border-white/5'} ${isSelectedDate ? 'bg-white/5' : ''}`}
                        >
                            <div className={`text-center p-2 border-b border-white/5 flex flex-col items-center justify-center gap-2 h-20 ${isTodayDate ? 'text-blue-400' : 'text-white/50'}`}>
                                <div className="text-xs uppercase font-medium">{DAYS[date.getDay()]}</div>
                                <div className={`text-xl font-bold flex items-center justify-center w-8 h-8 rounded-full ${isTodayDate ? 'bg-blue-500 text-white' : ''}`}>
                                    {date.getDate()}
                                </div>
                            </div>
                            <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
                                {dayEvents.map(event => (
                                    <div 
                                        key={event.id} 
                                        onClick={(e) => { e.stopPropagation(); onEditEvent(event); }}
                                        className="bg-white/10 p-2 rounded-lg text-xs hover:bg-white/20 cursor-pointer"
                                    >
                                        <div className="font-bold text-blue-300">{new Date(event.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                        <div className="truncate">{event.title}</div>
                                    </div>
                                ))}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const d = new Date(date);
                                        d.setHours(9, 0, 0, 0);
                                        onAddEvent(d);
                                    }}
                                    className="w-full py-2 mt-2 border border-dashed border-white/10 rounded-lg text-white/30 text-xs hover:bg-white/5 hover:text-white/50 transition-colors"
                                >
                                    + Ajouter
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
                                    className="absolute left-[90px] right-4 rounded-lg bg-[#3b82f6]/20 border-l-[3px] border-[#3b82f6] px-3 py-2 cursor-pointer hover:bg-[#3b82f6]/30 hover:z-20 transition-all overflow-hidden group select-none z-10 shadow-sm backdrop-blur-[1px]"
                                    style={{ top: `${top}px`, height: `${height - 2}px` }} 
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
            </div>

            {/* Day Details Panel - Hide in Day View to avoid duplication, OR keep it? 
                User might want consistent layout. Let's keep it visible except maybe in Day view where it's redundant?
                Actually, the Day View above is just a center list. 
                Let's hide the side panel in Day View to give more space.
            */}
            {view !== 'day' && (
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