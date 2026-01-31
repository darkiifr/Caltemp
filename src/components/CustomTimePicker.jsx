import React, { useState, useRef, useEffect } from 'react';
import { playBubbleSound } from '../utils/sound';

export default function CustomTimePicker({ value, onChange }) {
    // value format: HH:MM
    const [isOpen, setIsOpen] = useState(false);
    const [hour, min] = (value || '12:00').split(':');

    // Generate arrays
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')); // Steps of 5 for simpler UI
    // Or plain 0-59 if user really wants precision? Image 2 shows "00" selected, suggesting regular intervals or full list.
    // Let's do full 0-59 for precision but maybe scrollable.
    // Actually, let's keep it simple: 00-59 is fine for a scroll list.
    const allMinutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    const handleSelectHour = (h) => {
        playBubbleSound();
        onChange(`${h}:${min}`);
    };

    const handleSelectMin = (m) => {
        playBubbleSound();
        onChange(`${hour}:${m}`);
    };

    // Scroll active item into view when opening
    const hoursRef = useRef(null);
    const minsRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            // Simple timeout to allow render
            setTimeout(() => {
                const hEl = document.getElementById(`time-h-${hour}`);
                const mEl = document.getElementById(`time-m-${min}`);
                if (hEl && hoursRef.current) hoursRef.current.scrollTop = hEl.offsetTop - hoursRef.current.offsetTop - 60;
                if (mEl && minsRef.current) minsRef.current.scrollTop = mEl.offsetTop - minsRef.current.offsetTop - 60;
            }, 10);
        }
    }, [isOpen, hour, min]);

    return (
        <div className="relative">
            {/* Trigger Input */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white cursor-pointer hover:bg-white/10 transition-colors flex items-center"
            >
                {value}
            </div>

            {/* Dropdown Time Picker */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl p-2 z-50 animate-in zoom-in-95 duration-200 flex h-64 overflow-hidden">

                    {/* Hours Column */}
                    <div className="flex-1 flex flex-col border-r border-white/5">
                        <div className="text-center text-xs text-white/40 mb-2 py-1 font-medium uppercase tracking-wider">Heures</div>
                        <div ref={hoursRef} className="flex-1 overflow-y-auto custom-scrollbar px-1">
                            {hours.map(h => (
                                <button
                                    id={`time-h-${h}`}
                                    key={h}
                                    onClick={() => handleSelectHour(h)}
                                    className={`w-full py-1.5 rounded-lg text-sm mb-1 transition-colors ${h === hour ? 'bg-blue-600/80 text-white font-bold delay-75 duration-200' : 'text-white/60 hover:bg-white/10'}`}
                                >
                                    {h}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Minutes Column */}
                    <div className="flex-1 flex flex-col">
                        <div className="text-center text-xs text-white/40 mb-2 py-1 font-medium uppercase tracking-wider">Mins</div>
                        <div ref={minsRef} className="flex-1 overflow-y-auto custom-scrollbar px-1">
                            {allMinutes.map(m => (
                                <button
                                    id={`time-m-${m}`}
                                    key={m}
                                    onClick={() => handleSelectMin(m)}
                                    className={`w-full py-1.5 rounded-lg text-sm mb-1 transition-colors ${m === min ? 'bg-blue-600/80 text-white font-bold delay-75 duration-200' : 'text-white/60 hover:bg-white/10'}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
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
