import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Repeat, Calendar, CalendarDays, CalendarCheck, CalendarRange } from 'lucide-react';
import { playBubbleSound } from '../utils/sound';

const OPTIONS = [
    { value: 'none', label: 'Une seule fois', icon: Calendar },
    { value: 'daily', label: 'Tous les jours', icon: CalendarDays },
    { value: 'weekly', label: 'Toutes les semaines', icon: CalendarCheck },
    { value: 'monthly', label: 'Tous les mois', icon: CalendarRange },
    { value: 'yearly', label: 'Tous les ans', icon: Repeat }
];

export default function CustomRecurrenceSelect({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const toggleOpen = (e) => {
        e.preventDefault();
        playBubbleSound();
        setIsOpen(!isOpen);
    };

    const handleSelect = (val) => {
        playBubbleSound();
        onChange(val);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const selectedOption = OPTIONS.find(opt => opt.value === value) || OPTIONS[0];
    const SelectedIcon = selectedOption.icon;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={toggleOpen}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all flex items-center justify-between group hover:bg-white/10"
            >
                <div className="flex items-center gap-2">
                    <SelectedIcon className="w-4 h-4 text-white/50 group-hover:text-white/80 transition-colors" />
                    <span>{selectedOption.label}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-white/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    {OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        const isSelected = opt.value === value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleSelect(opt.value)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                                    isSelected 
                                    ? 'bg-blue-600/20 text-blue-400 font-medium border-l-2 border-blue-500' 
                                    : 'text-white/80 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                                }`}
                            >
                                <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-white/40'}`} />
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
