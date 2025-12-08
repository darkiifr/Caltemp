import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Gift, AlertCircle } from 'lucide-react';
import { getNameDay } from '../utils/namedays';

function EventCountdown({ date }) {
    const [timeLeft, setTimeLeft] = useState('');
    const [status, setStatus] = useState('future'); // future, now, past

    useEffect(() => {
        const calculateTimeLeft = () => {
            const now = new Date();
            const target = new Date(date);
            const diff = target - now;

            if (diff < -60000) { // 1 minute past
                setStatus('past');
                setTimeLeft('Passé');
                return;
            }
            if (diff <= 0) {
                setStatus('now');
                setTimeLeft('Maintenant');
                return;
            }

            setStatus('future');
            
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            const parts = [];
            if (days > 0) parts.push(`${days}j`);
            if (hours > 0) parts.push(`${hours}h`);
            if (minutes > 0) parts.push(`${minutes}m`);
            parts.push(`${seconds}s`);

            setTimeLeft(parts.join(' '));
        };

        calculateTimeLeft();
        const timer = setInterval(calculateTimeLeft, 1000);
        return () => clearInterval(timer);
    }, [date]);

    if (status === 'past') return <span className="text-gray-500 text-xs">Terminé</span>;
    if (status === 'now') return <span className="text-green-400 text-xs font-bold animate-pulse">En cours</span>;

    return (
        <div className="flex items-center gap-1 text-xs text-blue-300 font-mono bg-blue-500/10 px-2 py-1 rounded-md">
            <Clock size={12} />
            {timeLeft}
        </div>
    );
}

export default function DayDetails({ date, events, holiday, showNamedays }) {
    const nameDay = showNamedays ? getNameDay(date) : null;
    
    const formattedDate = date.toLocaleDateString('fr-FR', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long',
        year: 'numeric'
    });

    // Sort events by time
    const sortedEvents = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));

    return (
        <div className="w-80 bg-[#1e1e1e]/50 border-l border-white/5 flex flex-col h-full animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-white/5">
                <h3 className="text-xl font-bold text-white capitalize leading-tight">
                    {formattedDate}
                </h3>
                
                <div className="mt-4 space-y-2">
                    {holiday && (
                        <div className="flex items-center gap-2 text-purple-300 bg-purple-500/10 px-3 py-2 rounded-xl border border-purple-500/20">
                            <Gift size={16} />
                            <span className="font-medium">{holiday.name}</span>
                        </div>
                    )}
                    
                    {nameDay && (
                        <div className="flex items-center gap-2 text-blue-300 bg-blue-500/10 px-3 py-2 rounded-xl border border-blue-500/20">
                            <Calendar size={16} />
                            <span className="font-medium">Fête : St {nameDay}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2">
                    Événements ({events.length})
                </h4>
                
                {sortedEvents.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                        <p>Aucun événement</p>
                    </div>
                ) : (
                    sortedEvents.map(event => (
                        <div key={event.id} className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl p-4 transition-colors group">
                            <div className="flex justify-between items-start mb-2">
                                <h5 className="font-medium text-white truncate pr-2">{event.title}</h5>
                                <span className="text-xs text-gray-400 whitespace-nowrap">
                                    {new Date(event.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            
                            {event.description && (
                                <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                                    {event.description}
                                </p>
                            )}

                            <div className="flex justify-between items-center mt-2">
                                <EventCountdown date={event.date} />
                                {event.reminder && (
                                    <AlertCircle size={14} className="text-yellow-500/50" />
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
