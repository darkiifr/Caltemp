import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, AlignLeft, Bell, Trash2, Tag, ListChecks, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import CustomDatePicker from './CustomDatePicker';
import CustomTimePicker from './CustomTimePicker';
import CustomRecurrenceSelect from './CustomRecurrenceSelect';
import { DEFAULT_CATEGORY_LEGEND, inferCategory } from '../domain/events';
import CustomSelect from './CustomSelect';

export default function EventModal({ isOpen, onClose, onSave, onDelete, initialDate, initialEvent, settings = {} }) {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('12:00');
    const [description, setDescription] = useState('');
    const [reminder, setReminder] = useState(false);
    const [recurrence, setRecurrence] = useState('none');
    const [isDeleting, setIsDeleting] = useState(false);
    const [category, setCategory] = useState('perso');
    const [durationMinutes, setDurationMinutes] = useState(60);
    const [tags, setTags] = useState('');
    const [todos, setTodos] = useState([]);
    const [newTodo, setNewTodo] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);

    const categoryLegend = settings.categoryLegend || DEFAULT_CATEGORY_LEGEND;
    const categoryOptions = Object.entries(categoryLegend).map(([key, meta]) => ({
        value: key,
        label: meta.label,
        color: meta.color,
    }));

    useEffect(() => {
        if (isOpen) {
            if (initialEvent) {
                // eslint-disable-next-line
                setTitle(initialEvent.title);
                const d = new Date(initialEvent.originalDate || initialEvent.date);

                // Use local time for correct display date/time
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                setDate(`${y}-${m}-${day}`);

                const hours = String(d.getHours()).padStart(2, '0');
                const mins = String(d.getMinutes()).padStart(2, '0');
                setTime(`${hours}:${mins}`);

                setDescription(initialEvent.description || '');
                setReminder(initialEvent.reminder || false);
                setRecurrence(initialEvent.recurrence || 'none');
                setCategory(initialEvent.category || inferCategory(initialEvent.title));
                setDurationMinutes(initialEvent.durationMinutes || 60);
                setTags((initialEvent.tags || []).join(', '));
                setTodos(initialEvent.todos || []);
                setShowAdvanced(Boolean(
                    initialEvent.recurrence && initialEvent.recurrence !== 'none'
                    || initialEvent.category
                    || (initialEvent.tags || []).length
                    || (initialEvent.todos || []).length
                ));
            } else if (initialDate) {
                // Use local time for new event from calendar selection
                const y = initialDate.getFullYear();
                const m = String(initialDate.getMonth() + 1).padStart(2, '0');
                const day = String(initialDate.getDate()).padStart(2, '0');
                setDate(`${y}-${m}-${day}`);

                setTime('09:00');
                setTitle('');
                setDescription('');
                setReminder(false);
                setRecurrence('none');
                setCategory('perso');
                setDurationMinutes(60);
                setTags('');
                setTodos([]);
                setShowAdvanced(false);
            }
        } else {
            // Reset state when closed
            setIsDeleting(false);
        }
    }, [isOpen, initialDate, initialEvent]);

    const handleDeleteClick = () => {
        if (isDeleting) {
            if (onDelete) {
                onDelete(initialEvent.id);
                onClose();
            }
        } else {
            setIsDeleting(true);
        }
    };
    
    const handleSubmit = (e) => {
        e.preventDefault();
        const eventDate = new Date(`${date}T${time}`);

        onSave({
            id: initialEvent?.id || Date.now().toString(),
            title,
            date: eventDate.toISOString(),
            description,
            reminder,
            recurrence,
            category,
            color: categoryLegend[category]?.color || '#22c55e',
            durationMinutes: Number(durationMinutes) || 60,
            tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
            todos,
            examMeta: category === 'examen' ? { revisionPlanEnabled: true } : null,
            ...(initialEvent?.notifiedOccurrences && { notifiedOccurrences: initialEvent.notifiedOccurrences })
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto custom-scrollbar bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl p-6 scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-start gap-4 mb-6">
                    <div>
                        <h2 className="text-xl font-semibold text-white">
                            {initialEvent ? 'Modifier l\'événement' : 'Nouvel événement'}
                        </h2>
                        <p className="mt-1 text-sm text-white/45">
                            Renseigne l’essentiel maintenant. Les détails restent disponibles juste en dessous.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={20} className="text-white/50" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/15 text-xs font-semibold text-blue-200">1</span>
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">L’essentiel</h3>
                        </div>
                        <input
                            type="text"
                            placeholder="Ex. Cours de maths, devoir à rendre, rendez-vous..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                            autoFocus
                            required
                        />

                        <div className="relative rounded-xl border border-white/10 bg-white/5 transition-all focus-within:ring-2 focus-within:ring-blue-500/50">
                            <AlignLeft className="absolute left-3 top-4 text-white/30" size={18} />
                            <textarea
                                placeholder="Note ou détails utiles (optionnel)"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="block w-full min-h-[108px] resize-none bg-transparent pl-10 pr-4 py-4 leading-relaxed text-white placeholder-white/30 focus:outline-none"
                            />
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/15 text-xs font-semibold text-blue-200">2</span>
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">Quand ?</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="relative z-20 min-w-0">
                                <Calendar className="absolute left-3 top-3 text-white/30 z-10 pointer-events-none" size={18} />
                                <CustomDatePicker
                                    value={date}
                                    onChange={setDate}
                                />
                            </div>
                            <div className="relative z-20 min-w-0">
                                <Clock className="absolute left-3 top-3 text-white/30 z-10 pointer-events-none" size={18} />
                                <CustomTimePicker
                                    value={time}
                                    onChange={setTime}
                                />
                            </div>
                        </div>
                    </section>

                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setReminder(!reminder)}>
                        <div className={`p-2 rounded-full ${reminder ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/30'}`}>
                            <Bell size={16} />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-medium text-white">Alerte</div>
                            <div className="text-xs text-white/40">Recevoir un rappel pour ne pas l’oublier</div>
                        </div>
                        <div className={`w-5 h-5 rounded border ${reminder ? 'bg-blue-500 border-blue-500' : 'border-white/30'} flex items-center justify-center`}>
                            {reminder && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowAdvanced(prev => !prev)}
                        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-white/75 hover:bg-white/[0.07] hover:text-white transition-colors"
                        aria-expanded={showAdvanced}
                    >
                        <span>{showAdvanced ? 'Masquer les options avancées' : 'Afficher les options avancées'}</span>
                        {showAdvanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {showAdvanced && (
                        <section className="space-y-4 rounded-xl border border-white/10 bg-black/15 p-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">Options avancées</h3>

                            <div className="grid grid-cols-1 gap-2 relative z-10">
                                <label className="text-sm font-medium text-white/70 ml-1">Récurrence</label>
                                <CustomRecurrenceSelect
                                    value={recurrence}
                                    onChange={setRecurrence}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <label className="grid min-w-0 gap-2 text-sm text-white/70">
                                    Catégorie
                                    <CustomSelect
                                        value={category}
                                        onChange={setCategory}
                                        options={categoryOptions}
                                        ariaLabel="Type d'événement"
                                    />
                                </label>
                                <label className="grid min-w-0 gap-2 text-sm text-white/70">
                                    Durée
                                    <input
                                        type="number"
                                        min="5"
                                        step="5"
                                        value={durationMinutes}
                                        onChange={(e) => setDurationMinutes(e.target.value)}
                                        className="min-h-11 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    />
                                </label>
                            </div>

                            <div className="relative">
                                <Tag className="absolute left-3 top-3 text-white/30" size={18} />
                                <input
                                    type="text"
                                    placeholder="Tags séparés par des virgules"
                                    value={tags}
                                    onChange={(e) => setTags(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                />
                            </div>

                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                                    <ListChecks size={16} /> Mini todo-list
                                </div>
                                <div className="flex gap-2">
                            <input
                                value={newTodo}
                                onChange={(e) => setNewTodo(e.target.value)}
                                placeholder="Ajouter une tâche"
                                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    if (!newTodo.trim()) return;
                                    setTodos(prev => [...prev, { id: Date.now().toString(), title: newTodo.trim(), done: false }]);
                                    setNewTodo('');
                                }}
                                className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        {todos.map(todo => (
                            <label key={todo.id} className="flex items-center gap-2 text-sm text-white/70">
                                <input
                                    type="checkbox"
                                    checked={todo.done}
                                    onChange={(e) => setTodos(prev => prev.map(item => item.id === todo.id ? { ...item, done: e.target.checked } : item))}
                                />
                                <span className={todo.done ? 'line-through opacity-50' : ''}>{todo.title}</span>
                            </label>
                        ))}
                            </div>
                        </section>
                    )}

                    <div className="flex justify-between items-center gap-3 mt-6">
                        {initialEvent ? (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleDeleteClick}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                                        isDeleting 
                                        ? 'bg-red-500 text-white hover:bg-red-600' 
                                        : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                                    }`}
                                >
                                    <Trash2 size={16} />
                                    {isDeleting ? 'Confirmer ?' : 'Supprimer'}
                                </button>
                                {isDeleting && (
                                    <button
                                        type="button"
                                        onClick={() => setIsDeleting(false)}
                                        className="px-3 py-2 text-sm font-medium text-white/50 hover:text-white rounded-lg transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        ) : <div />}
                        
                        <div className="flex gap-3">
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
                    </div>
                </form>
            </div>
        </div>
    );
}
