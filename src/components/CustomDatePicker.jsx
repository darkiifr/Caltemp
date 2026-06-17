import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { playBubbleSound } from '../utils/sound';
import {
    DATE_PICKER_DAY_BUTTON_CLASS,
    DATE_PICKER_NAV_BUTTON_CLASS,
    DATE_PICKER_POPOVER_CLASS,
    DATE_PICKER_POPOVER_STYLE,
} from './datePickerStyles';

const DAYS = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
const MONTHS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export default function CustomDatePicker({ value, onChange }) {
    // value format: YYYY-MM-DD
    const [viewDate, setViewDate] = useState(() => value ? new Date(value) : new Date()); // For navigating months
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (value) {
            // eslint-disable-next-line
            setViewDate(new Date(value));
        }
    }, [value]);

    const getDaysInMonth = (year, month) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year, month) => {
        return new Date(year, month, 1).getDay(); // 0 = Sunday
    };

    const handlePrevMonth = (e) => {
        e.preventDefault();
        playBubbleSound();
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const handleNextMonth = (e) => {
        e.preventDefault();
        playBubbleSound();
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    const handleSelectDay = (day) => {
        playBubbleSound();
        const year = viewDate.getFullYear();
        const month = String(viewDate.getMonth() + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        onChange(`${year}-${month}-${dayStr}`);
        setIsOpen(false);
    };

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    // Create empty slots for days before the 1st
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
        <div className="relative">
            {/* Trigger Input */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white cursor-pointer hover:bg-white/10 transition-colors flex items-center"
            >
                {value ? new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sélectionner une date'}
            </div>

            {/* Dropdown Calendar */}
            {isOpen && (
                <div className={DATE_PICKER_POPOVER_CLASS} style={DATE_PICKER_POPOVER_STYLE}>
                    <div className="flex justify-between items-center mb-4">
                        <button type="button" onClick={handlePrevMonth} className={DATE_PICKER_NAV_BUTTON_CLASS}>
                            <ChevronLeft size={16} />
                        </button>
                        <span className="font-semibold text-white capitalize">
                            {MONTHS[month]} {year}
                        </span>
                        <button type="button" onClick={handleNextMonth} className={DATE_PICKER_NAV_BUTTON_CLASS}>
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {DAYS.map(d => (
                            <div key={d} className="text-center text-xs text-white/40 font-medium">
                                {d}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {blanks.map(b => <div key={`blank-${b}`} />)}
                        {days.map(d => {
                            const isSelected = value === `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            return (
                                <button
                                    type="button"
                                    key={d}
                                    onClick={() => handleSelectDay(d)}
                                    className={`
                                        ${DATE_PICKER_DAY_BUTTON_CLASS}
                                        ${isSelected ? '!bg-blue-600 text-white font-bold' : 'text-white/80 hover:bg-white/10'}
                                    `}
                                >
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Backdrop to close */}
            {isOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            )}
        </div>
    );
}
