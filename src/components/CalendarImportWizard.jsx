import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    Bell,
    CalendarArrowDown,
    Check,
    CircleAlert,
    ClipboardPaste,
    FolderOpen,
    Link as LinkIcon,
    Loader2,
    Repeat,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import CustomSelect from './CustomSelect';
import { inferCategory } from '../domain/events';
import { buildImportEventKey } from '../domain/icsImport';
import {
    IMPORT_PROVIDERS,
    analyzeImportEvents,
    getProviderLabel,
    isItemSelectedByDefault,
    summarizeImportItems,
} from '../domain/calendarImport';
import { parseImportSources, pickImportFiles, readImportPaths } from '../services/calendarImportFiles';

const MAX_VISIBLE_ROWS = 250;

const STATUS_META = {
    new: { label: 'Nouveau', className: 'bg-emerald-500/10 text-emerald-300' },
    update: { label: 'Modifié', className: 'bg-amber-500/10 text-amber-300' },
    duplicate: { label: 'Déjà présent', className: 'bg-white/5 text-white/40' },
};

const FILTERS = [
    { id: 'all', label: 'Tous' },
    { id: 'new', label: 'Nouveaux' },
    { id: 'update', label: 'Modifiés' },
    { id: 'duplicate', label: 'Doublons' },
    { id: 'past', label: 'Passés' },
];

function formatEventWhen(event) {
    if (!event.date) return 'Date inconnue';
    const date = new Date(event.date);
    return event.allDay
        ? date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
        : date.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function pickCalendarCategory(calendar, categoryOptions, fallback) {
    const known = new Set(categoryOptions.map(option => option.value));
    const name = (calendar.name || '').toLocaleLowerCase('fr-FR');
    const byLabel = categoryOptions.find(option => option.label && name.includes(option.label.toLocaleLowerCase('fr-FR')));
    if (byLabel) return byLabel.value;
    const inferred = inferCategory(calendar.name || '', fallback);
    return known.has(inferred) ? inferred : fallback;
}

function Toggle({ checked, onChange, label, description }) {
    return (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06]">
            <input type="checkbox" className="mt-0.5" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span className="min-w-0">
                <span className="block text-sm text-white">{label}</span>
                {description && <span className="block text-xs text-white/40">{description}</span>}
            </span>
        </label>
    );
}

export default function CalendarImportWizard({
    isOpen,
    onClose,
    existingEvents = [],
    categoryOptions = [],
    defaultCategory = 'perso',
    onImport,
    onOpenSubscriptions,
    pickFiles = pickImportFiles,
    readPaths = readImportPaths,
    parseSources = parseImportSources,
}) {
    const [step, setStep] = useState('source');
    const [providerId, setProviderId] = useState('google');
    const [isPasteOpen, setIsPasteOpen] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [calendars, setCalendars] = useState([]);
    const [calendarPrefs, setCalendarPrefs] = useState({});
    const [options, setOptions] = useState({ skipDuplicates: true, skipPast: false, applyUpdates: true, keepAlarms: true });
    const [manualSelection, setManualSelection] = useState({});
    const [categoryOverrides, setCategoryOverrides] = useState({});
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [result, setResult] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const addSourcesRef = useRef(null);
    const bodyRef = useRef(null);

    useEffect(() => {
        if (loadError) bodyRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
    }, [loadError]);

    const reset = () => {
        setStep('source');
        setIsPasteOpen(false);
        setPasteText('');
        setLoadError('');
        setCalendars([]);
        setCalendarPrefs({});
        setManualSelection({});
        setCategoryOverrides({});
        setSearch('');
        setFilter('all');
        setResult(null);
    };

    const close = () => {
        reset();
        onClose?.();
    };

    const addSources = async (files) => {
        if (!files.length) return;
        setIsLoading(true);
        setLoadError('');
        try {
            const parsed = await parseSources(files);
            const usable = parsed.filter(calendar => calendar.events.length > 0);
            const failures = parsed.filter(calendar => calendar.events.length === 0);
            if (failures.length && !usable.length) {
                setLoadError(failures.map(calendar => `${calendar.fileName} : ${calendar.error}`).join('\n'));
                return;
            }
            setCalendars(prev => [...prev, ...parsed]);
            setCalendarPrefs(prev => {
                const next = { ...prev };
                for (const calendar of parsed) {
                    next[calendar.id] = {
                        included: calendar.events.length > 0,
                        category: pickCalendarCategory(calendar, categoryOptions, defaultCategory),
                        reminder: false,
                    };
                }
                return next;
            });
            setStep('review');
        } catch (error) {
            setLoadError(error?.message || String(error));
        } finally {
            setIsLoading(false);
        }
    };
    addSourcesRef.current = addSources;

    const handlePickFiles = async () => {
        try {
            await addSources(await pickFiles());
        } catch (error) {
            setLoadError(`Impossible de lire les fichiers : ${error?.message || error}`);
        }
    };

    const handlePaste = async () => {
        if (!pasteText.trim()) return;
        await addSources([{ name: 'Texte collé', text: pasteText }]);
        setPasteText('');
        setIsPasteOpen(false);
    };

    // Native drag & drop: the desktop shell hands over file paths.
    useEffect(() => {
        if (!isOpen || !window.__TAURI_INTERNALS__) return undefined;
        let unlisten = null;
        let cancelled = false;
        import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent(async ({ payload }) => {
            if (payload.type === 'enter' || payload.type === 'over') setIsDragging(true);
            else if (payload.type === 'leave') setIsDragging(false);
            else if (payload.type === 'drop') {
                setIsDragging(false);
                try {
                    const files = await readPaths(payload.paths || []);
                    if (!files.length) {
                        setLoadError('Déposez un fichier .ics, .csv ou .zip.');
                        return;
                    }
                    await addSourcesRef.current?.(files);
                } catch (error) {
                    setLoadError(`Impossible de lire le fichier déposé : ${error?.message || error}. Utilisez « Choisir des fichiers ».`);
                }
            }
        })).then((stop) => {
            if (cancelled) stop();
            else unlisten = stop;
        }).catch(() => {});
        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [isOpen, readPaths]);

    const calendarById = useMemo(() => Object.fromEntries(calendars.map(calendar => [calendar.id, calendar])), [calendars]);

    const items = useMemo(() => {
        const flat = calendars.flatMap(calendar => calendar.events.map((event, index) => ({
            event,
            calendarId: calendar.id,
            key: `${calendar.id}:${index}`,
        })));
        const analyzed = analyzeImportEvents(flat.map(entry => entry.event), existingEvents);
        // Keys stay stable when calendars are added or removed.
        return analyzed.map((item, index) => ({ ...item, key: flat[index].key, calendarId: flat[index].calendarId }));
    }, [calendars, existingEvents]);

    const isSelected = (item) => {
        if (!calendarPrefs[item.calendarId]?.included) return false;
        return manualSelection[item.key] ?? isItemSelectedByDefault(item, options);
    };

    const includedItems = items.filter(item => calendarPrefs[item.calendarId]?.included);
    const summary = summarizeImportItems(includedItems);
    const selectedItems = includedItems.filter(isSelected);

    const visibleItems = useMemo(() => {
        const query = search.trim().toLocaleLowerCase('fr-FR');
        return items.filter(item => {
            if (!calendarPrefs[item.calendarId]?.included) return false;
            if (filter === 'past' && !item.isPast) return false;
            if (!['all', 'past'].includes(filter) && item.status !== filter) return false;
            if (!query) return true;
            return [item.event.title, item.event.location, item.event.description]
                .some(value => (value || '').toLocaleLowerCase('fr-FR').includes(query));
        });
    }, [items, calendarPrefs, filter, search]);

    const getItemCategory = (item) => categoryOverrides[item.key] || calendarPrefs[item.calendarId]?.category || defaultCategory;
    const getItemReminder = (item) => Boolean(calendarPrefs[item.calendarId]?.reminder)
        || (options.keepAlarms && (item.event.sourceReminder === true || (item.event.alarms || []).length > 0));

    const updateOption = (name, value) => {
        setOptions(prev => ({ ...prev, [name]: value }));
        setManualSelection({});
    };

    const updateCalendarPref = (calendarId, changes) => {
        setCalendarPrefs(prev => ({ ...prev, [calendarId]: { ...prev[calendarId], ...changes } }));
    };

    const removeCalendar = (calendarId) => {
        const remaining = calendars.filter(calendar => calendar.id !== calendarId);
        setCalendars(remaining);
        if (!remaining.length) setStep('source');
    };

    const setVisibleSelection = (selected) => {
        setManualSelection(prev => {
            const next = { ...prev };
            for (const item of visibleItems) next[item.key] = selected;
            return next;
        });
    };

    const handleImport = async () => {
        if (!selectedItems.length || !onImport) return;
        setIsImporting(true);
        try {
            const events = selectedItems.map(item => ({
                ...item.event,
                importSourceLabel: calendarById[item.calendarId]?.name || '',
            }));
            const overridesById = {};
            selectedItems.forEach((item, index) => {
                overridesById[buildImportEventKey(events[index], index)] = {
                    category: getItemCategory(item),
                    reminder: getItemReminder(item),
                };
            });
            const stats = await onImport(events, {
                overridesById,
                allowDuplicates: selectedItems.some(item => item.status === 'duplicate'),
            });
            setResult(stats || { added: events.length, updated: 0, skipped: 0 });
            setStep('done');
        } catch (error) {
            setLoadError(`L’import a échoué : ${error?.message || error}`);
        } finally {
            setIsImporting(false);
        }
    };

    if (!isOpen) return null;

    const provider = IMPORT_PROVIDERS.find(entry => entry.id === providerId) || IMPORT_PROVIDERS[0];
    const allWarnings = calendars.flatMap(calendar => [
        ...(calendar.error && !calendar.events.length ? [`${calendar.fileName} : ${calendar.error}`] : []),
        ...calendar.warnings.map(warning => `${calendar.fileName} : ${warning}`),
    ]);

    return (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Importer depuis un autre agenda">
            <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#181818] shadow-2xl">
                {isDragging && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-400/60 bg-blue-500/10 text-sm font-medium text-blue-100">
                        Déposez vos fichiers d’agenda ici
                    </div>
                )}

                <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                        {step === 'review' && (
                            <button type="button" onClick={() => setStep('source')} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" title="Ajouter d’autres fichiers">
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold text-white">
                                {step === 'done' ? 'Import terminé' : 'Importer depuis un autre agenda'}
                            </h3>
                            <p className="mt-1 text-sm text-white/45">
                                {step === 'source' && 'Google, Outlook, Apple, Proton… Retrouvez tous vos événements en une minute.'}
                                {step === 'review' && `${summary.total} événements dans ${calendars.filter(calendar => calendarPrefs[calendar.id]?.included).length} agenda(s) — vérifiez avant d’importer.`}
                                {step === 'done' && 'Vos événements sont dans Caltemp.'}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={close} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" title="Fermer">
                        <X size={18} />
                    </button>
                </div>

                <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
                    {loadError && (
                        <div className="mb-4 flex items-start gap-2 whitespace-pre-line rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
                            <CircleAlert size={16} className="mt-0.5 shrink-0" />
                            <span className="min-w-0 flex-1">{loadError}</span>
                            <button type="button" onClick={() => setLoadError('')} className="text-red-200/60 hover:text-red-100" title="Masquer">
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {step === 'source' && (
                        <div className="space-y-5">
                            <div>
                                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">D’où viennent vos événements ?</div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {IMPORT_PROVIDERS.map(entry => (
                                        <button
                                            key={entry.id}
                                            type="button"
                                            onClick={() => setProviderId(entry.id)}
                                            aria-pressed={entry.id === providerId}
                                            className={`rounded-xl border px-3 py-3 text-left transition-colors ${entry.id === providerId ? 'border-blue-400/60 bg-blue-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'}`}
                                        >
                                            <div className="text-sm font-medium text-white">{entry.label}</div>
                                            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-white/35">{entry.formats.join(' · ')}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                <div className="mb-2 text-sm font-medium text-white">Exporter depuis {provider.label}</div>
                                <ol className="space-y-1.5 text-sm text-white/60">
                                    {provider.steps.map((text, index) => (
                                        <li key={text} className="flex gap-2">
                                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] text-white/70">{index + 1}</span>
                                            <span>{text}</span>
                                        </li>
                                    ))}
                                </ol>
                                {provider.subscribeHint && (
                                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3 text-xs text-white/45">
                                        <Repeat size={13} className="shrink-0" />
                                        <span className="min-w-0 flex-1">{provider.subscribeHint}</span>
                                        {onOpenSubscriptions && (
                                            <button type="button" onClick={() => { reset(); onOpenSubscriptions(); }} className="inline-flex items-center gap-1 font-medium text-blue-300 hover:text-blue-200">
                                                <LinkIcon size={12} /> Ajouter un abonnement
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={handlePickFiles}
                                    disabled={isLoading}
                                    className="flex items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-left transition-colors hover:border-blue-400/50 hover:bg-blue-500/5 disabled:opacity-60"
                                >
                                    <div className="rounded-lg bg-blue-500/20 p-2 text-blue-300">
                                        {isLoading ? <Loader2 size={20} className="animate-spin" /> : <FolderOpen size={20} />}
                                    </div>
                                    <div>
                                        <div className="font-medium text-white">Choisir des fichiers</div>
                                        <div className="text-xs text-white/40">.ics, .csv ou .zip — plusieurs à la fois, ou glissez-déposez</div>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsPasteOpen(open => !open)}
                                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:bg-white/[0.07]"
                                >
                                    <div className="rounded-lg bg-purple-500/20 p-2 text-purple-300">
                                        <ClipboardPaste size={20} />
                                    </div>
                                    <div>
                                        <div className="font-medium text-white">Coller le contenu</div>
                                        <div className="text-xs text-white/40">Texte iCalendar ou CSV copié</div>
                                    </div>
                                </button>
                            </div>

                            {isPasteOpen && (
                                <div className="space-y-2">
                                    <textarea
                                        value={pasteText}
                                        onChange={(event) => setPasteText(event.target.value)}
                                        placeholder={'BEGIN:VCALENDAR…\nou\nSubject,Start Date,Start Time,…'}
                                        aria-label="Contenu de l'agenda à importer"
                                        rows={6}
                                        className="w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white placeholder-white/25 outline-none focus:border-blue-400/50"
                                    />
                                    <div className="flex justify-end">
                                        <button type="button" onClick={handlePaste} disabled={!pasteText.trim() || isLoading} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                                            Analyser
                                        </button>
                                    </div>
                                </div>
                            )}

                            {calendars.length > 0 && (
                                <button type="button" onClick={() => setStep('review')} className="text-sm font-medium text-blue-300 hover:text-blue-200">
                                    Revenir à l’aperçu ({calendars.length} agenda(s) chargé(s))
                                </button>
                            )}
                        </div>
                    )}

                    {step === 'review' && (
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {[
                                    ['Nouveaux', summary.new, 'text-emerald-300'],
                                    ['Modifiés', summary.update, 'text-amber-300'],
                                    ['Déjà présents', summary.duplicate, 'text-white/50'],
                                    ['Sélectionnés', selectedItems.length, 'text-blue-300'],
                                ].map(([label, value, color]) => (
                                    <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                                        <div className={`text-xl font-semibold ${color}`}>{value}</div>
                                        <div className="text-xs text-white/40">{label}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs font-medium uppercase tracking-wider text-white/40">Agendas détectés</div>
                                {calendars.map(calendar => {
                                    const prefs = calendarPrefs[calendar.id] || {};
                                    const usable = calendar.events.length > 0;
                                    return (
                                        <div key={calendar.id} className="grid items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_170px_auto_auto]">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(prefs.included)}
                                                disabled={!usable}
                                                onChange={(event) => updateCalendarPref(calendar.id, { included: event.target.checked })}
                                                aria-label={`Importer ${calendar.name}`}
                                            />
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium text-white">{calendar.name}</div>
                                                <div className="truncate text-xs text-white/35">
                                                    {getProviderLabel(calendar.provider)} · {calendar.format.toUpperCase()} · {usable ? `${calendar.events.length} événements` : calendar.error}
                                                </div>
                                            </div>
                                            <CustomSelect
                                                value={prefs.category || defaultCategory}
                                                onChange={(value) => updateCalendarPref(calendar.id, { category: value })}
                                                options={categoryOptions}
                                                ariaLabel={`Catégorie pour ${calendar.name}`}
                                            />
                                            <label className="flex items-center gap-1.5 text-xs text-white/60" title="Activer les alertes pour cet agenda">
                                                <input type="checkbox" checked={Boolean(prefs.reminder)} onChange={(event) => updateCalendarPref(calendar.id, { reminder: event.target.checked })} />
                                                <Bell size={13} /> Alertes
                                            </label>
                                            <button type="button" onClick={() => removeCalendar(calendar.id)} className="rounded-lg p-1.5 text-white/35 hover:bg-white/10 hover:text-red-300" title="Retirer cet agenda">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                                <Toggle checked={options.skipDuplicates} onChange={(value) => updateOption('skipDuplicates', value)} label="Ignorer les doublons" description="Même titre à la même heure, ou déjà importé." />
                                <Toggle checked={options.applyUpdates} onChange={(value) => updateOption('applyUpdates', value)} label="Mettre à jour les événements modifiés" description="Vos catégories, alertes et tâches sont conservées." />
                                <Toggle checked={options.skipPast} onChange={(value) => updateOption('skipPast', value)} label="Ignorer les événements passés" description={`${summary.past} événement(s) terminé(s).`} />
                                <Toggle checked={options.keepAlarms} onChange={(value) => setOptions(prev => ({ ...prev, keepAlarms: value }))} label="Conserver les rappels d’origine" description="Active l’alerte quand l’agenda source en avait une." />
                            </div>

                            {allWarnings.length > 0 && (
                                <details className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
                                    <summary className="cursor-pointer">{allWarnings.length} avertissement(s) lors de la lecture</summary>
                                    <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto custom-scrollbar">
                                        {allWarnings.map(warning => <li key={warning}>{warning}</li>)}
                                    </ul>
                                </details>
                            )}

                            <div className="overflow-hidden rounded-xl border border-white/10">
                                <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2">
                                    <div className="flex min-w-[160px] flex-1 items-center gap-2 rounded-lg bg-black/30 px-2 py-1.5">
                                        <Search size={14} className="text-white/35" />
                                        <input
                                            value={search}
                                            onChange={(event) => setSearch(event.target.value)}
                                            placeholder="Rechercher…"
                                            aria-label="Rechercher un événement à importer"
                                            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {FILTERS.map(entry => (
                                            <button
                                                key={entry.id}
                                                type="button"
                                                onClick={() => setFilter(entry.id)}
                                                className={`rounded-lg px-2 py-1 text-xs ${filter === entry.id ? 'bg-white/15 text-white' : 'text-white/45 hover:bg-white/5 hover:text-white'}`}
                                            >
                                                {entry.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-1 text-xs">
                                        <button type="button" onClick={() => setVisibleSelection(true)} className="rounded-lg px-2 py-1 text-blue-300 hover:bg-white/5">Tout cocher</button>
                                        <button type="button" onClick={() => setVisibleSelection(false)} className="rounded-lg px-2 py-1 text-white/45 hover:bg-white/5">Tout décocher</button>
                                    </div>
                                </div>
                                <div className="max-h-72 divide-y divide-white/5 overflow-y-auto custom-scrollbar">
                                    {visibleItems.slice(0, MAX_VISIBLE_ROWS).map(item => {
                                        const meta = STATUS_META[item.status];
                                        const selected = isSelected(item);
                                        return (
                                            <div key={item.key} className={`grid grid-cols-[auto_minmax(0,1fr)_150px] items-center gap-3 px-3 py-2 ${selected ? '' : 'opacity-55'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={(event) => setManualSelection(prev => ({ ...prev, [item.key]: event.target.checked }))}
                                                    aria-label={`Importer ${item.event.title}`}
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="truncate text-sm font-medium text-white">{item.event.title || 'Sans titre'}</span>
                                                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${meta.className}`}>{meta.label}</span>
                                                        {item.isPast && <span className="shrink-0 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">Passé</span>}
                                                        {item.event.recurrence && item.event.recurrence !== 'none' && <Repeat size={12} className="shrink-0 text-white/35" aria-label="Récurrent" />}
                                                    </div>
                                                    <div className="truncate text-xs text-white/35">
                                                        {formatEventWhen(item.event)}
                                                        {item.event.location ? ` · ${item.event.location}` : ''}
                                                        {calendars.length > 1 ? ` · ${calendarById[item.calendarId]?.name}` : ''}
                                                    </div>
                                                </div>
                                                <CustomSelect
                                                    value={getItemCategory(item)}
                                                    onChange={(value) => setCategoryOverrides(prev => ({ ...prev, [item.key]: value }))}
                                                    options={categoryOptions}
                                                    ariaLabel={`Catégorie pour ${item.event.title || 'événement'}`}
                                                />
                                            </div>
                                        );
                                    })}
                                    {visibleItems.length === 0 && (
                                        <div className="px-3 py-8 text-center text-sm text-white/35">Aucun événement ne correspond.</div>
                                    )}
                                    {visibleItems.length > MAX_VISIBLE_ROWS && (
                                        <div className="px-3 py-2 text-center text-xs text-white/35">
                                            + {visibleItems.length - MAX_VISIBLE_ROWS} autres événements (affinez la recherche pour les voir)
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'done' && result && (
                        <div className="flex flex-col items-center py-8 text-center">
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                                <Check size={28} />
                            </div>
                            <div className="grid w-full max-w-md grid-cols-3 gap-2">
                                {[
                                    ['Ajoutés', result.added, 'text-emerald-300'],
                                    ['Mis à jour', result.updated, 'text-amber-300'],
                                    ['Ignorés', result.skipped, 'text-white/50'],
                                ].map(([label, value, color]) => (
                                    <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                        <div className={`text-2xl font-semibold ${color}`}>{value}</div>
                                        <div className="text-xs text-white/40">{label}</div>
                                    </div>
                                ))}
                            </div>
                            {onOpenSubscriptions && (
                                <p className="mt-5 max-w-md text-sm text-white/45">
                                    Pour que les nouveaux événements arrivent automatiquement, ajoutez le lien ICS de votre agenda en{' '}
                                    <button type="button" onClick={() => { reset(); onOpenSubscriptions(); }} className="font-medium text-blue-300 hover:text-blue-200">abonnement synchronisé</button>.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-[#202020] px-5 py-4">
                    {step === 'done' ? (
                        <>
                            <button type="button" onClick={reset} className="rounded-xl px-4 py-2 text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white">
                                Importer autre chose
                            </button>
                            <button type="button" onClick={close} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500">
                                Terminer
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" onClick={close} className="rounded-xl px-4 py-2 text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white">
                                Annuler
                            </button>
                            {step === 'review' && (
                                <button
                                    type="button"
                                    onClick={handleImport}
                                    disabled={!selectedItems.length || isImporting}
                                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                                >
                                    {isImporting ? <Loader2 size={16} className="animate-spin" /> : <CalendarArrowDown size={16} />}
                                    Importer {selectedItems.length} événement{selectedItems.length > 1 ? 's' : ''}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
