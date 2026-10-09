import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Loader2, MapPin, MapPinOff, Pencil, X } from 'lucide-react';
import SlippyMap from './SlippyMap';
import { formatEventDate } from '../domain/events';
import { normalizeLocationKey } from '../domain/geo';
import { buildMapItems } from '../domain/mapItems';
import { TILE_PROVIDERS, getTileProviderId } from '../domain/mapTiles';
import { getGeocoder } from '../services/geocoding';

const PERIODS = [
    ['7', '7 jours'],
    ['30', '30 jours'],
    ['all', 'Tout'],
];
const MAX_LIST_ITEMS = 200;

function RemindersMap({ events, settings = {}, onEditEvent, onSettingsPatch }) {
    const mapRef = useRef(null);
    const [geocoder, setGeocoder] = useState(null);
    const [geoVersion, setGeoVersion] = useState(0);
    const [period, setPeriod] = useState('30');
    const [alertsOnly, setAlertsOnly] = useState(false);
    const [selection, setSelection] = useState(null);
    const [geocoding, setGeocoding] = useState(null);
    const autoGeocode = Boolean(settings.mapAutoGeocode);

    useEffect(() => {
        let unsubscribe = () => {};
        let cancelled = false;
        getGeocoder().then((instance) => {
            if (cancelled) return;
            setGeocoder(instance);
            setGeoVersion(instance.getVersion());
            unsubscribe = instance.subscribe(setGeoVersion);
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    // Geocoding answers can arrive in bursts: let the map catch up between frames.
    const deferredGeoVersion = useDeferredValue(geoVersion);
    const { items, unresolved, notFound } = useMemo(() => buildMapItems(events, {
        period,
        alertsOnly,
        lookup: geocoder ? geocoder.peek : null,
    }), [events, period, alertsOnly, geocoder, deferredGeoVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    const runGeocoding = useCallback(async (locations) => {
        if (!geocoder || !locations.length) return;
        setGeocoding({ done: 0, total: locations.length });
        await geocoder.geocodeMany(locations, (done, total) => setGeocoding({ done, total }));
        setGeocoding(null);
    }, [geocoder]);

    const unresolvedKey = unresolved.map(normalizeLocationKey).join('|');
    useEffect(() => {
        if (!autoGeocode || !geocoder || geocoding || !unresolved.length) return;
        runGeocoding(unresolved);
        // Re-run only when the set of missing places changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoGeocode, geocoder, unresolvedKey]);

    const hasItems = items.length > 0;
    // Refit once a geocoding run is over, not on its first answer (which would
    // zoom onto a single place).
    const fitKey = hasItems && !geocoding ? `${period}:${alertsOnly}:${items.length}` : '';

    const selectedItems = useMemo(() => {
        if (!selection) return [];
        const keys = new Set(selection.keys);
        return items.filter(item => keys.has(item.key));
    }, [items, selection]);

    const handleSelect = useCallback((cluster) => {
        const placeKeys = new Set(cluster.items.map(item => normalizeLocationKey(item.placeLabel)));
        if (cluster.items.length > 1 && placeKeys.size > 1) {
            mapRef.current?.fitTo(cluster.items);
            setSelection(null);
            return;
        }
        setSelection({ keys: cluster.items.map(item => item.key), anchor: cluster.items[0].key });
    }, []);

    const focusItem = (item) => {
        setSelection({ keys: [item.key], anchor: item.key });
        mapRef.current?.flyTo(item);
    };

    const theme = settings.theme === 'light' ? 'light' : 'dark';
    const providerId = getTileProviderId(settings);
    const listItems = items.slice(0, MAX_LIST_ITEMS);

    return (
        <div className="flex min-h-0 flex-1 gap-3 caltemp-event-in">
            <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-hidden">
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex rounded-lg bg-black/20 p-0.5" role="group" aria-label="Période">
                        {PERIODS.map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={period === value}
                                onClick={() => setPeriod(value)}
                                className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                                    period === value ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/80'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
                        <input type="checkbox" checked={alertsOnly} onChange={(e) => setAlertsOnly(e.target.checked)} />
                        <Bell size={12} /> Rappels avec alerte uniquement
                    </label>
                    {onSettingsPatch && (
                        <div className="flex items-center gap-2 text-xs text-white/50">
                            Fond
                            <div className="flex flex-1 rounded-lg bg-black/20 p-0.5" role="group" aria-label="Fond de carte">
                                {Object.entries(TILE_PROVIDERS).map(([id, { label }]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        aria-pressed={providerId === id}
                                        onClick={() => onSettingsPatch({ mapProvider: id })}
                                        className={`flex-1 rounded-md px-2 py-1 font-semibold transition-colors ${
                                            providerId === id ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/80'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {notFound > 0 && !unresolved.length && !geocoding && (
                    <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/45">
                        <MapPinOff size={13} className="mt-0.5 shrink-0" />
                        {notFound} lieu{notFound > 1 ? 'x' : ''} introuvable{notFound > 1 ? 's' : ''}. Précise l’adresse ou place l’événement sur la carte depuis l’éditeur.
                    </div>
                )}

                {unresolved.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-50/90">
                        {geocoding ? (
                            <div className="flex items-center gap-2">
                                <Loader2 size={13} className="animate-spin" />
                                Localisation {geocoding.done}/{geocoding.total}…
                            </div>
                        ) : (
                            <>
                                <div className="flex items-start gap-2">
                                    <MapPinOff size={13} className="mt-0.5 shrink-0" />
                                    <span>
                                        {unresolved.length} lieu{unresolved.length > 1 ? 'x' : ''} sans coordonnées.
                                        Seul le texte du lieu est envoyé à OpenStreetMap (Nominatim) pour le localiser.
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    disabled={!geocoder}
                                    onClick={() => runGeocoding(unresolved)}
                                    className="w-full rounded-lg bg-amber-400/20 px-3 py-1.5 font-semibold text-amber-50 hover:bg-amber-400/30 disabled:opacity-50"
                                >
                                    Localiser maintenant
                                </button>
                            </>
                        )}
                        {onSettingsPatch && (
                            <label className="flex cursor-pointer items-center gap-2 text-amber-50/70">
                                <input
                                    type="checkbox"
                                    checked={autoGeocode}
                                    onChange={(e) => onSettingsPatch({ mapAutoGeocode: e.target.checked })}
                                />
                                Localiser automatiquement les nouveaux lieux
                            </label>
                        )}
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-white/[0.03]">
                    {items.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-white/40">
                            <MapPin size={22} className="text-white/25" />
                            Aucun rappel localisé pour cette période.
                            <span>Ajoute un lieu à un événement (adresse, coordonnées ou lien de carte), ou place-le sur la carte depuis l’éditeur.</span>
                        </div>
                    ) : (
                        <ul className="divide-y divide-white/5">
                            {listItems.map(item => (
                                <li key={item.key}>
                                    <button
                                        type="button"
                                        onClick={() => focusItem(item)}
                                        className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06] ${
                                            selection?.keys.includes(item.key) ? 'bg-white/[0.08]' : ''
                                        }`}
                                    >
                                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1 truncate text-sm font-medium text-white/90">
                                                {item.event.reminder && <Bell size={11} className="shrink-0 text-blue-300" />}
                                                <span className="truncate">{item.event.title}</span>
                                            </span>
                                            <span className="block truncate text-[11px] text-white/45">{item.placeLabel}</span>
                                            {item.next && (
                                                <span className="block text-[11px] text-white/35">{formatEventDate(item.next, settings)}</span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </aside>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10">
                <SlippyMap
                    ref={mapRef}
                    className="h-full w-full"
                    points={items}
                    fitKey={fitKey}
                    theme={theme}
                    provider={providerId}
                    selectedKey={selection?.anchor || ''}
                    onSelect={handleSelect}
                    onMapClick={() => setSelection(null)}
                >
                    {selectedItems.length > 0 && (
                        <div data-map-control="" className="absolute bottom-6 left-3 z-10 w-80 max-w-[calc(100%-1.5rem)] rounded-xl border border-white/10 bg-[#1e1e1e]/95 p-3 shadow-2xl backdrop-blur-md caltemp-event-in">
                            <div className="mb-2 flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-white/60">
                                    <MapPin size={13} className="shrink-0" />
                                    <span className="truncate">{selectedItems[0].placeLabel}</span>
                                </div>
                                <button type="button" aria-label="Fermer" onClick={() => setSelection(null)} className="rounded-full p-1 text-white/50 hover:bg-white/10">
                                    <X size={14} />
                                </button>
                            </div>
                            <ul className="max-h-52 space-y-1 overflow-y-auto custom-scrollbar">
                                {selectedItems.map(item => (
                                    <li key={item.key} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2">
                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-white/90">{item.event.title}</span>
                                            <span className="block text-[11px] text-white/40">
                                                {item.next ? formatEventDate(item.next, settings) : 'Passé'}
                                            </span>
                                        </span>
                                        {onEditEvent && (
                                            <button
                                                type="button"
                                                aria-label={`Modifier ${item.event.title}`}
                                                onClick={() => onEditEvent(item.event)}
                                                className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                                            >
                                                <Pencil size={13} />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </SlippyMap>
            </div>
        </div>
    );
}

export default memo(RemindersMap);
