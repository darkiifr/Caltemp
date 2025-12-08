import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { getHolidays } from '../utils/holidays';
import { getNameDay } from '../utils/namedays';
import DayDetails from './DayDetails';

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export default function CalendarView({ events, onAddEvent, onEditEvent, onDeleteEvent, showHolidays = true, showNamedays = true }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [holidays, setHolidays] = useState([]);

    useEffect(() => {
        if (showHolidays) {
            setHolidays(getHolidays(currentDate.getFullYear()));
        } else {
            setHolidays([]);
        }
    }, [currentDate.getFullYear(), showHolidays]);

    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        return { days, firstDay };
    };

    const { days, firstDay } = getDaysInMonth(currentDate);

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const isToday = (day) => {
        const today = new Date();
        return day === today.getDate() &&
            currentDate.getMonth() === today.getMonth() &&
            currentDate.getFullYear() === today.getFullYear();
    };

    const isSelected = (day) => {
        return day === selectedDate.getDate() &&
            currentDate.getMonth() === selectedDate.getMonth() &&
            currentDate.getFullYear() === selectedDate.getFullYear();
    };

    const getEventsForDay = (day) => {
        const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString();
        return events.filter(e => new Date(e.date).toDateString() === dateStr);
    };

    const getHolidayForDay = (day) => {
        if (!showHolidays) return null;
        // Format date as YYYY-MM-DD
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        const dateStr = `${year}-${month}-${dayStr}`;
        return holidays.find(h => h.date === dateStr);
    };

    const getSelectedDayDetails = () => {
        const day = selectedDate.getDate();
        const dayEvents = events.filter(e => new Date(e.date).toDateString() === selectedDate.toDateString());
        
        // Need to find holiday for selectedDate, not just current month view
        // But holidays state is only for current month view. 
        // Ideally we should fetch holidays for selectedDate year if different.
        // For simplicity, we assume selectedDate is usually in view or we fetch holidays for it.
        // Let's just use getHolidays util directly if year matches or just rely on current state if year matches.
        
        let holiday = null;
        if (showHolidays) {
            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const dayStr = String(day).padStart(2, '0');
            const dateStr = `${year}-${month}-${dayStr}`;
            
            // If selected date is in current view year, use state, else fetch
            if (year === currentDate.getFullYear()) {
                holiday = holidays.find(h => h.date === dateStr);
            } else {
                const yearHolidays = getHolidays(year);
                holiday = yearHolidays.find(h => h.date === dateStr);
            }
        }

        return { events: dayEvents, holiday };
    };

    const { events: selectedEvents, holiday: selectedHoliday } = getSelectedDayDetails();

    return (
        <div className="flex h-full bg-transparent text-white overflow-hidden">
            <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
                {/* Header */}
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">
                            {MONTHS[currentDate.getMonth()]} <span className="text-white/50">{currentDate.getFullYear()}</span>
                        </h2>
                        <p className="text-white/40 mt-1 text-sm">
                            {events.length} événements prévus
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <ChevronLeft size={20} />
                        </button>
                        <button 
                            onClick={() => {
                                const now = new Date();
                                setCurrentDate(now);
                                setSelectedDate(now);
                            }} 
                            className="px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                        >
                            Aujourd'hui
                        </button>
                        <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-2 mb-2 shrink-0">
                    {DAYS.map(day => (
                        <div key={day} className="text-center text-sm font-medium text-white/30 py-2">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-2 flex-1 auto-rows-fr min-h-[400px]">
                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} />
                    ))}
                    
                    {Array.from({ length: days }).map((_, i) => {
                        const day = i + 1;
                        const dayEvents = getEventsForDay(day);
                        const holiday = getHolidayForDay(day);
                        const nameDay = showNamedays ? getNameDay(new Date(currentDate.getFullYear(), currentDate.getMonth(), day)) : null;
                        const today = isToday(day);
                        const selected = isSelected(day);

                        return (
                            <div
                                key={day}
                                onClick={() => setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                                className={`
                                    relative group p-2 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col
                                    ${today ? 'bg-blue-500/20 border-blue-500/50' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}
                                    ${selected ? 'ring-2 ring-blue-500' : ''}
                                `}
                            >
                                <div className="flex justify-between items-start shrink-0">
                                    <span className={`text-sm font-medium ${today ? 'text-blue-400' : 'text-white/70'}`}>
                                        {day}
                                    </span>
                                    {dayEvents.length > 0 && (
                                        <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                                    )}
                                </div>
                                
                                <div className="flex-1 flex flex-col gap-1 overflow-hidden mt-1 min-h-0">
                                    {holiday && (
                                        <div className="text-[10px] font-medium text-purple-200 bg-purple-500/30 rounded px-1 py-0.5 truncate w-full text-center">
                                            {holiday.name}
                                        </div>
                                    )}
                                    
                                    {dayEvents.slice(0, 3).map(event => (
                                        <div key={event.id} className="text-[10px] truncate text-white/70 bg-white/10 rounded px-1 py-0.5 w-full">
                                            {event.title}
                                        </div>
                                    ))}
                                    
                                    {dayEvents.length > 3 && (
                                        <div className="text-[9px] text-white/30 pl-1">
                                            +{dayEvents.length - 3}
                                        </div>
                                    )}
                                </div>

                                {nameDay && !holiday && (
                                    <div className="mt-auto pt-1 text-[9px] text-white/30 text-center truncate w-full shrink-0">
                                        St {nameDay}
                                    </div>
                                )}

                                {/* Add Button (Hover) */}
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAddEvent(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
                                    }}
                                    className="absolute top-1 right-1 p-1 rounded-full bg-blue-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-600 z-10"
                                >
                                    <Plus size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {/* Day Details Panel */}
            <DayDetails 
                date={selectedDate} 
                events={selectedEvents} 
                holiday={selectedHoliday}
                showNamedays={showNamedays}
                onEditEvent={onEditEvent}
                onDeleteEvent={onDeleteEvent}
            />
        </div>
    );
}
