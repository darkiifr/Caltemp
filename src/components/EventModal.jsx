import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, AlignLeft, Bell } from 'lucide-react';

export default function EventModal({ isOpen, onClose, onSave, initialDate, initialEvent }) {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('12:00');
    const [description, setDescription] = useState('');
    const [reminder, setReminder] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialEvent) {
                setTitle(initialEvent.title);
                const d = new Date(initialEvent.date);
                setDate(d.toISOString().split('T')[0]);
                setTime(d.toTimeString().slice(0, 5));
                setDescription(initialEvent.description || '');
                setReminder(initialEvent.reminder || false);
            } else if (initialDate) {
                setDate(initialDate.toISOString().split('T')[0]);
                setTime('09:00');
                setTitle('');
                setDescription('');
                setReminder(false);
            }
        }
    }, [isOpen, initialDate, initialEvent]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const eventDate = new Date(`${date}T${time}`);
        
        onSave({
            id: initialEvent?.id || Date.now().toString(),
            title,
            date: eventDate.toISOString(),
            description,
            reminder
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl p-6 scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-white">
                        {initialEvent ? 'Modifier l\'événement' : 'Nouvel événement'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={20} className="text-white/50" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="text"
                            placeholder="Titre de l'événement"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                            autoFocus
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="relative">
                            <Calendar className="absolute left-3 top-3 text-white/30" size={18} />
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                required
                            />
                        </div>
                        <div className="relative">
                            <Clock className="absolute left-3 top-3 text-white/30" size={18} />
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                required
                            />
                        </div>
                    </div>

                    <div className="relative">
                        <AlignLeft className="absolute left-3 top-3 text-white/30" size={18} />
                        <textarea
                            placeholder="Description (optionnel)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[100px] resize-none"
                        />
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setReminder(!reminder)}>
                        <div className={`p-2 rounded-full ${reminder ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/30'}`}>
                            <Bell size={16} />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-medium text-white">Rappel</div>
                            <div className="text-xs text-white/40">M'avertir avant l'événement</div>
                        </div>
                        <div className={`w-5 h-5 rounded border ${reminder ? 'bg-blue-500 border-blue-500' : 'border-white/30'} flex items-center justify-center`}>
                            {reminder && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                        >
                            Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
