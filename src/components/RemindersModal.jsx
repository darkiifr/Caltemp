import React, { useState, useMemo } from 'react';
import { X, ListTodo, Search, Trash2, Repeat, Calendar as CalendarIcon, Bell } from 'lucide-react';
import { formatEventDate } from '../domain/events';

export default function RemindersModal({ isOpen, onClose, events, onDeleteEvent, settings = {} }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [deletingId, setDeletingId] = useState(null);

    // Group and filter events
    const { recurringEvents, singleEvents } = useMemo(() => {
        const filtered = events.filter(e => 
            e.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (e.description && e.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        const recurring = [];
        const single = [];

        filtered.forEach(e => {
            if (e.recurrence && e.recurrence !== 'none') {
                recurring.push(e);
            } else {
                single.push(e);
            }
        });

        // Sort single events by date (newest first or upcoming first?)
        // Let's do upcoming first, if past then put to bottom
        single.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return dateA.getTime() - dateB.getTime();
        });

        return { recurringEvents: recurring, singleEvents: single };
    }, [events, searchTerm]);

    const getRecurrenceLabel = (recurrence) => {
        const labels = {
            'daily': 'Tous les jours',
            'weekly': 'Toutes les semaines',
            'monthly': 'Tous les mois',
            'yearly': 'Tous les ans'
        };
        return labels[recurrence] || recurrence;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            <div className="bg-[#1e1e1e] w-full max-w-3xl h-full max-h-[80vh] rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="h-16 border-b border-white/5 flex items-center justify-between px-8 shrink-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
                    <div className="flex items-center gap-3">
                        <ListTodo className="w-5 h-5 text-blue-400" />
                        <h2 className="text-xl font-semibold text-white">Tous les événements</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={20} className="text-white/50" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-white/5 bg-black/20 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                            type="text"
                            placeholder="Rechercher un événement..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-transparent to-black/10 custom-scrollbar space-y-8">
                    
                    {/* Recurring Events */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Repeat className="w-4 h-4 text-purple-400" />
                            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Récurrents ({recurringEvents.length})</h3>
                        </div>
                        
                        {recurringEvents.length === 0 ? (
                            <p className="text-sm text-white/30 italic px-4">Aucun événement récurrent.</p>
                        ) : (
                            <div className="grid gap-3">
                                {recurringEvents.map(event => (
                                    <EventCard 
                                        key={event.id} 
                                        event={event} 
                                        deletingId={deletingId}
                                        setDeletingId={setDeletingId}
                                        onDelete={onDeleteEvent}
                                        label={getRecurrenceLabel(event.recurrence)}
                                        icon={<Repeat className="w-3.5 h-3.5 text-purple-400" />}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Single Events */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <CalendarIcon className="w-4 h-4 text-blue-400" />
                            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Ponctuels ({singleEvents.length})</h3>
                        </div>
                        
                        {singleEvents.length === 0 ? (
                            <p className="text-sm text-white/30 italic px-4">Aucun événement ponctuel.</p>
                        ) : (
                            <div className="grid gap-3">
                                {singleEvents.map(event => (
                                    <EventCard 
                                        key={event.id} 
                                        event={event} 
                                        deletingId={deletingId}
                                        setDeletingId={setDeletingId}
                                        onDelete={onDeleteEvent}
                                        label={formatEventDate(event.date, settings, { includeTime: false })}
                                        icon={<CalendarIcon className="w-3.5 h-3.5 text-blue-400" />}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}

function EventCard({ event, deletingId, setDeletingId, onDelete, label, icon }) {
    const isDeleting = deletingId === event.id;
    const isPast = !event.recurrence || event.recurrence === 'none' 
        ? new Date(event.date) < new Date() 
        : false;

    return (
        <div className={`p-4 rounded-xl border border-white/5 bg-white/5 flex items-center justify-between gap-4 transition-all hover:bg-white/10 ${isPast ? 'opacity-60' : ''}`}>
            <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-white truncate">{event.title}</h4>
                    {event.reminder && (
                        <div title="Rappel activé" className="p-1 bg-amber-500/10 rounded">
                            <Bell className="w-3 h-3 text-amber-400" />
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
                    {icon}
                    <span className="capitalize">{label}</span>
                    <span className="opacity-50 mx-1">•</span>
                    <span>{new Date(event.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {event.description && (
                    <p className="text-xs text-gray-500 mt-2 truncate">{event.description}</p>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {isDeleting ? (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setDeletingId(null)}
                            className="px-3 py-1.5 text-xs font-medium text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={() => onDelete(event.id)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-lg shadow-red-500/20 flex items-center gap-1.5"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Confirmer
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setDeletingId(event.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Supprimer"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
