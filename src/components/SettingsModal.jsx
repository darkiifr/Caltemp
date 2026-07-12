import React, { useMemo, useState, useEffect } from 'react';
import { X, Monitor, Cpu, Info, Check, RefreshCw, Layout, Download, Upload, Coffee, Image as ImageIcon, Search, Tags, ListChecks, Link as LinkIcon, Puzzle, Palette, Type, Sparkles, CalendarDays, ShieldCheck, ExternalLink, Github, PackageCheck } from 'lucide-react';
import { getVersion } from '@tauri-apps/plugin-app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { message, save } from '@tauri-apps/plugin-dialog';
import { open as openLink } from '@tauri-apps/plugin-shell';
import UpdateModal from './UpdateModal';
import CustomSelect from './CustomSelect';
import MarketplacePanel from './MarketplacePanel';
import IcsAssistantPanel from './IcsAssistantPanel';
import { open } from '@tauri-apps/plugin-dialog';
import { Trash2, Volume2, VolumeX, Play, MousePointerClick, BellRing } from 'lucide-react';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { normalizeSoundConfig, playSoundPreview, SOUND_PRESETS, isAudioPlaybackSupported } from '../utils/sound';
import { copyCustomSoundToAppData, getSoundDisplayName } from '../utils/soundFiles';
import { generateICS, parseICS } from '../utils/ics';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { DEFAULT_CATEGORY_LEGEND, normalizeSettings } from '../domain/events';
import { normalizeIcsSources } from '../domain/icsSources';
import { buildImportEventKey, isValidIcsUrl } from '../domain/icsImport';
import { isHttpsImageUrl, resolveBackgroundImageUrl } from '../utils/background';
import { getCompatibleWindowEffect, isWindowEffectSupported, WINDOW_EFFECTS } from '../utils/windowEffects';
import { FREE_MODEL_PREFERENCES, isAiConfigured } from '../services/ai';
import { getMostUsedAiModel, normalizeAiUsageStats } from '../domain/aiUsage';
import { enrichUpdateWithGithubReleaseNotes } from '../domain/updateReleaseNotes';

const formatUsageNumber = (value) => Number(value || 0).toLocaleString('fr-FR');

const formatUsageDate = (value) => {
    if (!value) return 'Jamais';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Jamais';
    return date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export default function SettingsModal({
    isOpen,
    onClose,
    settings,
    onSave,
    onPreview,
    events,
    onImportEvents,
    osType,
    initialActiveTab = 'general',
    installedExtensions = [],
    extensionErrors = [],
    onRefreshExtensions,
    onRequestRestart,
    onSyncIcsSource,
    onAddAndSyncIcsSource,
    onToggleIcsSource,
    onRemoveIcsSource,
}) {
    const [activeTab, setActiveTab] = useState('general');
    const [appVersion, setAppVersion] = useState('Unknown');
    const [updateStatus, setUpdateStatus] = useState(null);
    const [localSettings, setLocalSettings] = useState({ ...settings });
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [availableUpdate, setAvailableUpdate] = useState(null);
    const [newCategory, setNewCategory] = useState({ id: '', label: '', color: '#60a5fa' });
    const [newRoutine, setNewRoutine] = useState({ title: '', category: 'perso', durationMinutes: 60 });
    const [newIcsSource, setNewIcsSource] = useState({ label: '', url: '' });
    const [icsImportDraft, setIcsImportDraft] = useState(null);
    const [syncingIcsSourceId, setSyncingIcsSourceId] = useState('');
    const [unsubscribeDraft, setUnsubscribeDraft] = useState(null);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    
    // Unsplash State
    const [unsplashQuery, setUnsplashQuery] = useState('');
    const [unsplashResults, setUnsplashResults] = useState([]);
    const [isSearchingUnsplash, setIsSearchingUnsplash] = useState(false);
    const [unsplashError, setUnsplashError] = useState('');
    const [hasSearched, setHasSearched] = useState(false);
    const [backgroundUrlInput, setBackgroundUrlInput] = useState('');

    const displayOsName = osType === 'macos' ? 'macOS' : (osType === 'linux' ? 'Linux' : 'Windows');
    const isTauriRuntime = Boolean(window.__TAURI_INTERNALS__);
    const categoryLegend = localSettings.categoryLegend || DEFAULT_CATEGORY_LEGEND;
    const categoryOptions = useMemo(() => Object.entries(categoryLegend).map(([key, meta]) => ({
        value: key,
        label: meta.label,
        color: meta.color,
    })), [categoryLegend]);
    const dateFormatOptions = [
        { value: 'weekday-short', label: 'Mar. 16 juin, 09:00' },
        { value: 'long', label: 'Mardi 16 juin 2026, 09:00' },
        { value: 'numeric', label: '16/06/2026, 09:00' },
    ];
    const soundConfig = normalizeSoundConfig(localSettings.soundConfig || {});
    const soundTargets = [
        {
            id: 'bubble',
            label: 'Interactions',
            desc: 'Clics, boutons et petites confirmations.',
            icon: MousePointerClick,
        },
        {
            id: 'notification',
            label: 'Notifications',
            desc: 'Création, import et confirmation visible.',
            icon: BellRing,
        },
        {
            id: 'ringtone',
            label: 'Rappels',
            desc: 'Alertes d’événements avec rappel activé.',
            icon: Volume2,
        },
    ];
    const titlebarOptions = [
        { value: 'windows', label: 'Windows', description: 'Boutons à droite, repères familiers sur PC.' },
        { value: 'macos', label: 'macOS', description: 'Contrôles colorés à gauche, barre plus compacte.' },
    ];
    const windowEffectOptions = WINDOW_EFFECTS.map(option => ({
        ...option,
        supported: isWindowEffectSupported(option.value, osType),
    }));
    const fontSizeOptions = [
        { label: 'Compacte', value: 14, sample: 'Plus dense' },
        { label: 'Standard', value: 16, sample: 'Équilibrée' },
        { label: 'Large', value: 20, sample: 'Plus lisible' },
    ];
    const activeTitlebar = titlebarOptions.find(option => option.value === localSettings.titlebarStyle) || titlebarOptions[0];
    const activeEffectValue = getCompatibleWindowEffect(localSettings.windowEffect, osType);
    const activeEffect = windowEffectOptions.find(option => option.value === activeEffectValue) || windowEffectOptions[0];
    const activeFontSize = fontSizeOptions.find(option => option.value === localSettings.fontSize) || fontSizeOptions[1];
    const activeDateFormat = dateFormatOptions.find(option => option.value === (localSettings.dateFormat || 'weekday-short')) || dateFormatOptions[0];
    const updateStatusMeta = {
        checking: { label: 'Recherche en cours', tone: 'text-blue-300', icon: RefreshCw },
        available: { label: 'Mise à jour disponible', tone: 'text-amber-300', icon: Download },
        uptodate: { label: 'Caltemp est à jour', tone: 'text-emerald-300', icon: Check },
        error: { label: 'Vérification impossible', tone: 'text-red-300', icon: Info },
    }[updateStatus] || { label: 'Non vérifié', tone: 'text-gray-400', icon: Info };
    const UpdateStatusIcon = updateStatusMeta.icon;
    const aboutRows = [
        { label: 'Version', value: appVersion, icon: PackageCheck },
        { label: 'Plateforme', value: displayOsName, icon: Monitor },
        { label: 'Données', value: 'Stockage local Tauri', icon: ShieldCheck },
        { label: 'Extensions', value: `${installedExtensions.length} installée${installedExtensions.length > 1 ? 's' : ''}`, icon: Puzzle },
    ];
    const backgroundPreviewUrl = resolveBackgroundImageUrl(localSettings.appBackground || '');
    const audioSupported = isAudioPlaybackSupported();
    const aiUsageStats = normalizeAiUsageStats(localSettings.aiUsageStats);
    const mostUsedAiModel = getMostUsedAiModel(aiUsageStats);
    const averageTokensPerRequest = aiUsageStats.totalRequests
        ? Math.round(aiUsageStats.totalTokens / aiUsageStats.totalRequests)
        : 0;

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialActiveTab || 'general');

            setLocalSettings({ ...settings });
            setBackgroundUrlInput(isHttpsImageUrl(settings.appBackground) ? settings.appBackground : '');
            setIsSavingSettings(false);

            // Check autostart status
            isEnabled().then(enabled => {
                setLocalSettings(prev => ({ ...prev, autoStart: enabled }));
            }).catch(e => console.error("Autostart check failed", e));

            // Try to fetch version from version.json first (for accurate build version)
            fetch('/version.json')
                .then(res => res.json())
                .then(data => {
                    if (data.version) {
                        setAppVersion(data.version);
                    } else {
                        throw new Error('No version in version.json');
                    }
                })
                .catch(() => {
                    // Fallback to Tauri API
                    getVersion()
                        .then(ver => setAppVersion(ver))
                        .catch(err => {
                            console.error('Failed to get version:', err);
                            setAppVersion('Unknown');
                        });
                });
        }
    }, [initialActiveTab, isOpen, settings]);

    const handleChange = (key, value) => {
        if (key === 'windowEffect' && !isWindowEffectSupported(value, osType)) return;
        const nextValue = key === 'windowEffect' ? getCompatibleWindowEffect(value, osType) : value;
        const previewSettings = { ...localSettings, [key]: nextValue };
        setLocalSettings(prev => ({ ...prev, [key]: nextValue }));

        // Apply immediate effects outside the state updater to avoid render-phase side effects.
        if (key === 'windowEffect') {
            invoke('set_window_effect', { effect: nextValue });
        }

        if (key === 'autoStart') {
            (async () => {
                try {
                    if (nextValue) await enable();
                    else await disable();
                } catch (e) {
                    console.error('Failed to toggle autostart', e);
                }
            })();
        }

        if (onPreview) {
            queueMicrotask(() => onPreview(previewSettings));
        }
    };

    const handleMultipleChanges = (changes) => {
        const previewSettings = { ...localSettings, ...changes };
        setLocalSettings(prev => {
            const newSettings = { ...prev, ...changes };
            return newSettings;
        });
        if (onPreview) {
            queueMicrotask(() => onPreview(previewSettings));
        }
    };

    const handleSave = async () => {
        if (isSavingSettings) return;
        setIsSavingSettings(true);
        try {
            await onSave(normalizeSettings({
                ...localSettings,
                windowEffect: getCompatibleWindowEffect(localSettings.windowEffect, osType),
            }));
        } catch (error) {
            console.error('Failed to apply settings:', error);
            await message(`Impossible d'appliquer les changements : ${error.message || error}`, { kind: 'error', title: 'Paramètres' });
            setIsSavingSettings(false);
        }
    };

    const handleExportICS = async () => {
        try {
            const icsData = generateICS(events);
            if (!icsData) {
                await message('Aucun événement à exporter.', { kind: 'info' });
                return;
            }

            const path = await save({
                filters: [{
                    name: 'Calendar',
                    extensions: ['ics']
                }],
                defaultPath: 'caltemp_export.ics'
            });

            if (path) {
                await writeTextFile(path, icsData);
                await message('Exportation réussie !', { kind: 'info', title: 'Export' });
            }
        } catch (e) {
            console.error(e);
            await message('Erreur lors de l\'exportation: ' + e, { kind: 'error' });
        }
    };

    const prepareIcsImport = async ({ content, sourceId, sourceLabel, defaultCategory = 'perso', defaultReminder = false }) => {
        const importedEvents = parseICS(content);

        if (importedEvents.length === 0) {
            await message('Aucun événement trouvé dans cet agenda.', { kind: 'warning' });
            return;
        }

        setIcsImportDraft({
            sourceId,
            sourceLabel,
            events: importedEvents,
            defaultCategory,
            defaultReminder,
            overridesById: {},
        });
    };

    const handleImportICS = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Calendar',
                    extensions: ['ics']
                }]
            });

            if (selected) {
                const content = await readTextFile(selected);
                await prepareIcsImport({ content, sourceLabel: selected });
            }
        } catch (e) {
            console.error(e);
            await message('Erreur lors de l\'importation: ' + e, { kind: 'error' });
        }
    };

    const handleImportIcsUrl = async (source) => {
        const url = source.url?.trim();
        if (!isValidIcsUrl(url)) {
            await message('Seules les URL ICS en HTTPS sont acceptées.', { kind: 'warning', title: 'Import ICS' });
            return;
        }

        try {
            const response = await tauriFetch(url, { method: 'GET' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const content = await response.text();
            await prepareIcsImport({
                content,
                sourceId: source.id,
                sourceLabel: source.label || url,
                defaultCategory: source.defaultCategory || 'perso',
                defaultReminder: Boolean(source.defaultReminder),
            });
        } catch (error) {
            console.error(error);
            await message(`Impossible de charger l’URL ICS : ${error.message || error}`, { kind: 'error', title: 'Import ICS' });
        }
    };

    const updateIcsOverride = (event, index, changes) => {
        const key = buildImportEventKey(event, index);
        setIcsImportDraft(prev => ({
            ...prev,
            overridesById: {
                ...prev.overridesById,
                [key]: {
                    ...(prev.overridesById[key] || {}),
                    ...changes,
                },
            },
        }));
    };

    const confirmIcsImport = async () => {
        if (!icsImportDraft || !onImportEvents) return;
        await onImportEvents(icsImportDraft.events, {
            defaultCategory: icsImportDraft.defaultCategory,
            defaultReminder: icsImportDraft.defaultReminder,
            overridesById: icsImportDraft.overridesById,
            sourceLabel: icsImportDraft.sourceLabel,
            sourceId: icsImportDraft.sourceId,
        });
        await message('Importation réussie !', { kind: 'info', title: 'Import' });
        setIcsImportDraft(null);
    };

    const checkForUpdates = async () => {
        setUpdateStatus('checking');
        try {
            const update = await check();
            if (update?.available) {
                const updateWithReleaseNotes = await enrichUpdateWithGithubReleaseNotes(update, { fetcher: tauriFetch });
                setUpdateStatus('available');
                setAvailableUpdate(updateWithReleaseNotes);
                setShowUpdateModal(true);
            } else {
                setUpdateStatus('uptodate');
                await message('Aucune mise à jour disponible. Vous utilisez la dernière version.', { title: 'Caltemp', kind: 'info' });
            }
        } catch (error) {
            console.error(error);
            setUpdateStatus('error');
            const errorMessage = error instanceof Error ? error.message : String(error);
            await message(`Erreur lors de la vérification : ${errorMessage}`, { title: 'Erreur', kind: 'error' });
        }
    };

    const handleInstallUpdate = async () => {
        if (!availableUpdate) return;

        // Save settings before updating to ensure persistence
        try {
            if (onSave) {
                await onSave(localSettings);
            }
        } catch (err) {
            console.error("Error saving settings before update:", err);
        }

        try {
            await availableUpdate.downloadAndInstall();
            await relaunch();
        } catch (error) {
            console.error('Update failed:', error);
            await message('Échec de la mise à jour: ' + error.message, { title: 'Erreur', kind: 'error' });
        }
    };

    const handleSelectSound = async (type) => {
        if (!isTauriRuntime) {
            await message('La sélection de fichier audio est disponible dans l’application desktop.', { kind: 'info', title: 'Sons' });
            return;
        }

        try {
            const file = await open({
                multiple: false,
                filters: [{
                    name: 'Audio',
                    extensions: ['mp3', 'wav', 'ogg', 'm4a']
                }]
            });

            if (file) {
                const storedSound = await copyCustomSoundToAppData(file, type);
                const nextSoundConfig = normalizeSoundConfig({
                    ...soundConfig,
                    [type]: storedSound
                });
                handleChange('soundConfig', nextSoundConfig);
                const previewResult = await playSoundPreview(type, nextSoundConfig);
                if (!previewResult?.ok) {
                    await message(`Le fichier a été copié, mais la préécoute a échoué : ${previewResult?.reason || 'erreur inconnue'}`, { kind: 'warning', title: 'Sons' });
                }
            }
        } catch (err) {
            console.error("Error selecting sound file:", err);
            await message(`Impossible de copier ce fichier audio : ${err.message || err}`, { kind: 'error', title: 'Sons' });
        }
    };

    const handleSoundConfigChange = (changes) => {
        handleChange('soundConfig', normalizeSoundConfig({
            ...soundConfig,
            ...changes,
        }));
    };

    const handlePreviewSound = async (type) => {
        const result = await playSoundPreview(type, soundConfig);
        if (!result?.ok) {
            await message(`Impossible de lire ce son : ${result?.reason || 'erreur inconnue'}`, { kind: 'error', title: 'Sons' });
        }
    };

    const handleResetSound = (type) => {
        handleSoundConfigChange({ [type]: null });
    };

    const handleExportTheme = async () => {
        const path = await save({
            filters: [{ name: 'Thème Caltemp', extensions: ['json'] }],
            defaultPath: 'caltemp-theme.json'
        });
        if (!path) return;
        const theme = {
            id: localSettings.activeThemeId || 'custom',
            categoryLegend: localSettings.categoryLegend || DEFAULT_CATEGORY_LEGEND,
            windowEffect: localSettings.windowEffect,
            appBackground: localSettings.appBackground,
        };
        await writeTextFile(path, JSON.stringify(theme, null, 2));
    };

    const handleImportTheme = async () => {
        const path = await open({
            multiple: false,
            filters: [{ name: 'Thème Caltemp', extensions: ['json'] }]
        });
        if (!path) return;
        try {
            const theme = JSON.parse(await readTextFile(path));
            if (!theme || typeof theme !== 'object') throw new Error('Format invalide');
            handleMultipleChanges({
                activeThemeId: theme.id || 'custom',
                categoryLegend: theme.categoryLegend || localSettings.categoryLegend || DEFAULT_CATEGORY_LEGEND,
                windowEffect: theme.windowEffect || localSettings.windowEffect,
                appBackground: theme.appBackground || localSettings.appBackground,
            });
        } catch (error) {
            await message(`Thème invalide : ${error.message}`, { kind: 'error' });
        }
    };

    const handleAddRoutine = () => {
        if (!newRoutine.title.trim()) return;
        handleChange('routines', [
            ...(localSettings.routines || []),
            {
                id: Date.now().toString(),
                title: newRoutine.title.trim(),
                category: newRoutine.category,
                durationMinutes: Number(newRoutine.durationMinutes) || 60,
            }
        ]);
        setNewRoutine({ title: '', category: 'perso', durationMinutes: 60 });
    };

    const handleAddCategory = () => {
        const id = (newCategory.id || newCategory.label)
            .trim()
            .toLocaleLowerCase('fr-FR')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-|-$/g, '');
        if (!id || !newCategory.label.trim()) return;
        handleChange('categoryLegend', {
            ...categoryLegend,
            [id]: {
                label: newCategory.label.trim(),
                color: newCategory.color,
                custom: true,
            },
        });
        setNewCategory({ id: '', label: '', color: '#60a5fa' });
    };

    const applySyncedSourceToLocalSettings = (source) => {
        if (!source) return;
        const currentSources = normalizeIcsSources(localSettings.icsSources || []);
        const sourceExists = currentSources.some(item => item.id === source.id);
        const nextSources = sourceExists
            ? currentSources.map(item => item.id === source.id ? source : item)
            : normalizeIcsSources([...currentSources, source]);
        handleChange('icsSources', nextSources);
    };

    const handleAddAndSyncIcsSource = async (source) => {
        if (!onAddAndSyncIcsSource) {
            return { source, error: new Error('La synchronisation ICS n’est pas disponible.') };
        }
        setSyncingIcsSourceId(source.id || 'new-source');
        try {
            const result = await onAddAndSyncIcsSource(source);
            if (result?.source && !result?.duplicate && !result?.error) {
                applySyncedSourceToLocalSettings(result.source);
            }
            if (result?.duplicate) {
                applySyncedSourceToLocalSettings(result.source);
            }
            return result;
        } finally {
            setSyncingIcsSourceId('');
        }
    };

    const handleAddIcsSource = async () => {
        if (!newIcsSource.label.trim() || !newIcsSource.url.trim()) return;
        const result = await handleAddAndSyncIcsSource({
            id: `custom-${Date.now()}`,
            label: newIcsSource.label.trim(),
            type: 'url',
            url: newIcsSource.url.trim(),
            enabled: true,
            refreshMinutes: 15,
        });
        if (result?.duplicate) {
            await message(`Cette URL existe déjà dans « ${result.source?.label || 'Sources ICS'} ».`, { kind: 'info', title: 'Source ICS' });
            return;
        }
        if (result?.error) {
            await message(`Impossible d’ajouter cette source : ${result.source?.lastSyncMessage || result.error.message || result.error}`, { kind: 'error', title: 'Source ICS' });
            return;
        }
        setNewIcsSource({ label: '', url: '' });
    };

    const handleSyncIcsSource = async (source) => {
        if (!onSyncIcsSource || syncingIcsSourceId) return null;
        setSyncingIcsSourceId(source.id);
        try {
            const result = await onSyncIcsSource(source.id, { force: true, source });
            if (result?.source) applySyncedSourceToLocalSettings(result.source);
            if (result?.error) {
                await message(`Synchronisation impossible : ${result.source?.lastSyncMessage || result.error.message || result.error}`, { kind: 'error', title: 'Source ICS' });
            }
            return result;
        } finally {
            setSyncingIcsSourceId('');
        }
    };

    const handleToggleIcsSource = async (source, enabled) => {
        const optimisticSource = { ...source, enabled };
        handleChange('icsSources', normalizeIcsSources(localSettings.icsSources || []).map(item => item.id === source.id ? optimisticSource : item));
        if (!onToggleIcsSource) return;
        setSyncingIcsSourceId(source.id);
        try {
            const result = await onToggleIcsSource(source.id, enabled);
            if (result?.source) applySyncedSourceToLocalSettings(result.source);
            if (result?.error) {
                await message(`Synchronisation impossible : ${result.source?.lastSyncMessage || result.error.message || result.error}`, { kind: 'error', title: 'Source ICS' });
            }
        } finally {
            setSyncingIcsSourceId('');
        }
    };

    const handleRemoveIcsSource = async () => {
        if (!unsubscribeDraft || !onRemoveIcsSource) return;
        setSyncingIcsSourceId(unsubscribeDraft.source.id);
        try {
            await onRemoveIcsSource(unsubscribeDraft.source.id, { preserveEvents: unsubscribeDraft.preserveEvents });
            handleChange('icsSources', normalizeIcsSources(localSettings.icsSources || []).filter(source => source.id !== unsubscribeDraft.source.id));
            setUnsubscribeDraft(null);
        } finally {
            setSyncingIcsSourceId('');
        }
    };

    if (!isOpen) return null;

    const searchUnsplash = async () => {
        const activeUnsplashKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
        if (!unsplashQuery.trim()) {
            setUnsplashError("Veuillez entrer un terme de recherche.");
            return;
        }
        if (!activeUnsplashKey) {
            setUnsplashError("La clé API Unsplash n'est pas configurée dans l'environnement.");
            return;
        }
        setIsSearchingUnsplash(true);
        setUnsplashError('');
        setHasSearched(false);
        try {
            const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(unsplashQuery)}&per_page=12`, {
                headers: {
                    Authorization: `Client-ID ${activeUnsplashKey}`
                }
            });
            const data = await res.json();
            if (data.results && data.results.length === 0) {
                setUnsplashError("Aucun résultat trouvé pour votre recherche.");
                setUnsplashResults([]);
            } else if (data.errors) {
                setUnsplashError(data.errors[0]);
            } else {
                setUnsplashResults(data.results || []);
            }
        } catch {
            setUnsplashError("Erreur lors de la recherche. Vérifiez votre connexion et clé API.");
        } finally {
            setIsSearchingUnsplash(false);
            setHasSearched(true);
        }
    };

    const handleApplyUnsplash = async (img) => {
        const activeUnsplashKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
        const updated = {
            ...localSettings,
            appBackground: img.urls.full,
            backgroundEnabled: true, // Auto-enable if applying an image
            unsplashAttribution: {
                name: img.user.name,
                link: img.user.links.html
            }
        };
        setLocalSettings(updated);
        if (onPreview) onPreview(updated);
        try {
            // Unsplash Guideline: Trigger download
            await fetch(img.links.download_location, {
                headers: { Authorization: `Client-ID ${activeUnsplashKey}` }
            });
        } catch(e) {
            console.error("Failed to trigger Unsplash download:", e);
        }
    };

    const applyBackground = (changes) => {
        handleMultipleChanges({
            backgroundEnabled: true,
            ...changes,
        });
    };

    const handleSelectBackgroundFile = async () => {
        if (!isTauriRuntime) {
            await message('La sélection de fichier est disponible dans l’application desktop.', { kind: 'info', title: 'Fond de l’app' });
            return;
        }

        try {
            const file = await open({
                multiple: false,
                filters: [{
                    name: 'Image',
                    extensions: ['png', 'jpg', 'jpeg', 'webp']
                }]
            });
            if (!file) return;
            applyBackground({
                appBackground: file,
                unsplashAttribution: null,
                backgroundSource: 'file',
            });
        } catch (error) {
            console.error(error);
            await message(`Impossible de choisir cette image : ${error.message || error}`, { kind: 'error', title: 'Fond de l’app' });
        }
    };

    const handleApplyBackgroundUrl = async () => {
        const value = backgroundUrlInput.trim();
        if (!isHttpsImageUrl(value)) {
            await message('Utilisez une URL d’image en HTTPS.', { kind: 'warning', title: 'Fond de l’app' });
            return;
        }

        applyBackground({
            appBackground: value,
            unsplashAttribution: null,
            backgroundSource: 'url',
        });
    };

    const tabs = [
        { id: 'general', label: 'Général', icon: Monitor },
        { id: 'appearance', label: 'Apparence', icon: Layout },
        { id: 'productivity', label: 'Productivité', icon: ListChecks },
        { id: 'sounds', label: 'Sons', icon: Volume2 },
        { id: 'ai', label: 'Intelligence Artificielle', icon: Cpu },
        { id: 'background', label: 'Fond de l\'app', icon: ImageIcon },
        { id: 'extensions', label: 'Extensions', icon: Puzzle },
        { id: 'about', label: 'À propos', icon: Info },
    ];

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
                <div className="bg-[#1e1e1e] w-full max-w-[800px] h-full max-h-[600px] rounded-2xl shadow-2xl border border-white/10 flex overflow-hidden animate-control-panel">

                    {/* Sidebar */}
                    <div className="w-64 bg-[#252525] border-r border-white/5 p-4 flex flex-col gap-2">
                        <h2 className="text-xl font-bold text-white px-4 mb-6 mt-2">Paramètres</h2>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <tab.icon className="w-4 h-4 shrink-0" />
                                {tab.label}
                            </button>
                        ))}

                        <div className="mt-auto pt-4 border-t border-white/5">
                            <button
                                onClick={() => openLink('https://ko-fi.com/darkiifr')}
                                className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-[#29abe0]/10 to-[#ff5f5f]/10 border border-white/5 hover:border-white/20 hover:brightness-110 rounded-xl transition-all group"
                            >
                                <div className="p-2 bg-[#FF5E5B]/20 text-[#FF5E5B] group-hover:text-white group-hover:bg-[#FF5E5B] rounded-lg transition-colors">
                                    <Coffee className="w-4 h-4" />
                                </div>
                                <div className="text-left">
                                    <div className="font-medium text-white text-sm">Soutenir le projet</div>
                                    <div className="text-xs text-gray-400">Offrez-moi un café !</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {/* Header */}
                        <div className="h-16 border-b border-white/5 flex items-center justify-between px-8 shrink-0">
                            <h3 className="text-lg font-semibold text-white">{tabs.find(t => t.id === activeTab)?.label}</h3>
                            <button
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable Body */}
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">

                            {/* --- GENERAL --- */}
                            {activeTab === 'general' && (
                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Comportement</h4>

                                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                                            <div>
                                                <div className="font-medium text-white">Démarrage automatique</div>
                                                <div className="text-sm text-gray-400">Lancer Caltemp au démarrage de {displayOsName}</div>
                                            </div>
                                            <div className={`w-12 h-6 rounded-full transition-colors relative ${localSettings.autoStart ? 'bg-blue-600' : 'bg-gray-600'}`} onClick={() => handleChange('autoStart', !localSettings.autoStart)}>
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${localSettings.autoStart ? 'left-7' : 'left-1'}`} />
                                            </div>
                                        </label>

                                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                                            <div>
                                                <div className="font-medium text-white">Notifications</div>
                                                <div className="text-sm text-gray-400">Recevoir des rappels pour les événements</div>
                                            </div>
                                            <div className={`w-12 h-6 rounded-full transition-colors relative ${localSettings.notifications ? 'bg-blue-600' : 'bg-gray-600'}`} onClick={() => handleChange('notifications', !localSettings.notifications)}>
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${localSettings.notifications ? 'left-7' : 'left-1'}`} />
                                            </div>
                                        </label>

                                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                                            <div>
                                                <div className="font-medium text-white">Présence Discord</div>
                                                <div className="text-sm text-gray-400">Afficher uniquement l&apos;état général de Caltemp, sans détail personnel</div>
                                            </div>
                                            <div className={`w-12 h-6 rounded-full transition-colors relative ${localSettings.discordRpcEnabled ? 'bg-indigo-600' : 'bg-gray-600'}`} onClick={() => handleChange('discordRpcEnabled', !localSettings.discordRpcEnabled)}>
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${localSettings.discordRpcEnabled ? 'left-7' : 'left-1'}`} />
                                            </div>
                                        </label>

                                        <div className="pt-4 border-t border-white/5">
                                             <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Données</h4>
                                             <div className="flex gap-4">
                                                 <button 
                                                    onClick={handleExportICS}
                                                    className="flex-1 flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
                                                 >
                                                    <div className="p-2 bg-purple-500/20 text-purple-400 group-hover:bg-purple-500 group-hover:text-white rounded-lg transition-colors">
                                                        <Download size={20} />
                                                    </div>
                                                    <div className="text-left">
                                                        <div className="font-medium text-white">Exporter</div>
                                                        <div className="text-xs text-gray-400">Format .ics</div>
                                                    </div>
                                                 </button>

                                                 <button 
                                                    onClick={handleImportICS}
                                                    className="flex-1 flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
                                                 >
                                                    <div className="p-2 bg-blue-500/20 text-blue-400 group-hover:bg-blue-500 group-hover:text-white rounded-lg transition-colors">
                                                        <Upload size={20} />
                                                    </div>
                                                    <div className="text-left">
                                                        <div className="font-medium text-white">Importer</div>
                                                        <div className="text-xs text-gray-400">Format .ics</div>
                                                    </div>
                                                 </button>
                                             </div>
                                        </div>

                                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                                            <div>
                                                <div className="font-medium text-white">Afficher les fêtes</div>
                                                <div className="text-sm text-gray-400">Afficher les jours fériés sur le calendrier</div>
                                            </div>
                                            <div className={`w-12 h-6 rounded-full transition-colors relative ${localSettings.showHolidays !== false ? 'bg-blue-600' : 'bg-gray-600'}`} onClick={() => handleChange('showHolidays', localSettings.showHolidays === false)}>
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${localSettings.showHolidays !== false ? 'left-7' : 'left-1'}`} />
                                            </div>
                                        </label>

                                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                                            <div>
                                                <div className="font-medium text-white">Afficher les prénoms</div>
                                                <div className="text-sm text-gray-400">Afficher la fête du jour sur le calendrier</div>
                                            </div>
                                            <div className={`w-12 h-6 rounded-full transition-colors relative ${localSettings.showNamedays !== false ? 'bg-blue-600' : 'bg-gray-600'}`} onClick={() => handleChange('showNamedays', localSettings.showNamedays === false)}>
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${localSettings.showNamedays !== false ? 'left-7' : 'left-1'}`} />
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* --- APPEARANCE --- */}
                            {activeTab === 'appearance' && (
                                <div className="space-y-5">
                                    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
                                                <Palette size={20} />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-white">Aperçu de l’interface</h4>
                                                <p className="mt-1 text-sm text-gray-400">
                                                    Fenêtre {activeTitlebar.label}, effet {activeEffect.label.toLowerCase()}, police {activeFontSize.label.toLowerCase()}.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-[#121212]">
                                            <div className="flex h-9 items-center justify-between border-b border-white/10 bg-white/[0.04] px-3">
                                                {localSettings.titlebarStyle === 'macos' ? (
                                                    <div className="flex gap-1.5">
                                                        <span className="h-3 w-3 rounded-full bg-red-400" />
                                                        <span className="h-3 w-3 rounded-full bg-amber-300" />
                                                        <span className="h-3 w-3 rounded-full bg-emerald-400" />
                                                    </div>
                                                ) : (
                                                    <span className="text-xs font-medium text-gray-400">Caltemp</span>
                                                )}
                                                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                                    <span>{activeEffect.label}</span>
                                                    {localSettings.titlebarStyle !== 'macos' && (
                                                        <div className="flex gap-2 text-gray-500">
                                                            <span>_</span>
                                                            <span>□</span>
                                                            <span>×</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="relative overflow-hidden p-4">
                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.35),transparent_28%),radial-gradient(circle_at_82%_28%,rgba(168,85,247,0.25),transparent_24%),linear-gradient(135deg,#202020,#0b0b0b)]" />
                                                <div className={`relative grid gap-3 rounded-lg border border-white/10 p-4 md:grid-cols-[1fr_120px] ${
                                                    activeEffectValue === 'none'
                                                        ? 'bg-[#171717]'
                                                        : activeEffectValue === 'blur'
                                                            ? 'bg-[#171717]/70 backdrop-blur-md'
                                                            : activeEffectValue === 'acrylic'
                                                                ? 'bg-[#171717]/65 backdrop-blur-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                                                                : 'bg-[#171717]/82 backdrop-saturate-150'
                                                }`}>
                                                    <div>
                                                        <div className="text-sm font-semibold text-white">Mardi 16 juin</div>
                                                        <div className="mt-1 text-sm text-gray-400">{activeDateFormat.label}</div>
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            <span className="rounded-md bg-sky-400/15 px-2 py-1 text-xs text-sky-200">Cours</span>
                                                            <span className="rounded-md bg-emerald-400/15 px-2 py-1 text-xs text-emerald-200">Perso</span>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                        <div className="text-[11px] uppercase tracking-wider text-gray-500">Lecture</div>
                                                        <div className="mt-2 text-white" style={{ fontSize: `${activeFontSize.value}px` }}>Événement</div>
                                                        <div className="mt-1 text-xs text-gray-500">Police {activeFontSize.value}px</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-gray-400">
                                            <Sparkles size={15} />
                                            Fenêtre
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-white">Style de la barre de titre</label>
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                {titlebarOptions.map(option => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => handleChange('titlebarStyle', option.value)}
                                                        className={`rounded-lg border p-4 text-left transition-colors ${localSettings.titlebarStyle === option.value ? 'border-cyan-300/50 bg-cyan-300/10 text-white' : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'}`}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span className="font-semibold">{option.label}</span>
                                                            {localSettings.titlebarStyle === option.value && <Check size={16} className="text-cyan-200" />}
                                                        </div>
                                                        <p className="mt-2 text-sm text-gray-400">{option.description}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-white">Effet de transparence</label>
                                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                                {windowEffectOptions.map(option => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        disabled={!option.supported}
                                                        onClick={() => handleChange('windowEffect', option.value)}
                                                        className={`rounded-lg border p-3 text-left transition-colors ${activeEffectValue === option.value ? 'border-cyan-300/50 bg-cyan-300/10 text-white' : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'} ${!option.supported ? 'cursor-not-allowed opacity-40 hover:bg-white/[0.03]' : ''}`}
                                                    >
                                                        <div className="text-sm font-semibold">{option.label}</div>
                                                        <div className="mt-1 text-xs text-gray-500">
                                                            {option.supported ? option.description : `Non compatible avec ${displayOsName}`}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-xs text-gray-500">Les effets Acrylic et Mica dépendent du système et du rendu WebView.</p>
                                        </div>
                                    </div>

                                    <div className="grid gap-5 lg:grid-cols-2">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-gray-400">
                                                <Type size={15} />
                                                Lisibilité
                                            </div>
                                            <div className="grid gap-2">
                                                {fontSizeOptions.map(size => (
                                                    <button
                                                        key={size.value}
                                                        type="button"
                                                        onClick={() => handleChange('fontSize', size.value)}
                                                        className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${localSettings.fontSize === size.value ? 'border-cyan-300/50 bg-cyan-300/10 text-white' : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'}`}
                                                    >
                                                        <span>
                                                            <span className="block font-medium">{size.label}</span>
                                                            <span className="text-sm text-gray-500">{size.sample}</span>
                                                        </span>
                                                        <span className="text-sm tabular-nums text-gray-400">{size.value}px</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-gray-400">
                                                <CalendarDays size={15} />
                                                Dates
                                            </div>
                                            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                                                <label className="text-sm font-medium text-white">Format d’affichage</label>
                                                <div className="mt-3">
                                                    <CustomSelect
                                                        value={localSettings.dateFormat || 'weekday-short'}
                                                        onChange={(value) => handleChange('dateFormat', value)}
                                                        options={dateFormatOptions}
                                                        ariaLabel="Format d'affichage des dates"
                                                    />
                                                </div>
                                                <div className="mt-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-gray-300">
                                                    Exemple : {activeDateFormat.label}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- SOUNDS --- */}
                            {activeTab === 'sounds' && (
                                <div className="space-y-4">
                                    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${soundConfig.enabled ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/5 text-gray-400'}`}>
                                                    {soundConfig.enabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-semibold text-white">Sons de Caltemp</h4>
                                                    <p className="mt-1 text-sm text-gray-400">
                                                        {audioSupported ? 'Un volume, un profil, puis des sons personnalisés si besoin.' : 'Le moteur audio WebView n’est pas disponible ici.'}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSoundConfigChange({ enabled: !soundConfig.enabled })}
                                                className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors md:w-40 ${soundConfig.enabled ? 'bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}
                                            >
                                                {soundConfig.enabled ? 'Activés' : 'Coupés'}
                                            </button>
                                        </div>

                                        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px] md:items-center">
                                            <label className="min-w-0">
                                                <div className="mb-2 flex items-center justify-between gap-3">
                                                    <span className="text-sm font-medium text-white">Volume</span>
                                                    <span className="text-sm tabular-nums text-gray-300">{Math.round(soundConfig.volume * 100)}%</span>
                                                </div>
                                                <input
                                                    id="sound-volume"
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.05"
                                                    value={soundConfig.volume}
                                                    onChange={(event) => handleSoundConfigChange({ volume: Number(event.target.value) })}
                                                    className="w-full accent-emerald-400"
                                                    disabled={!soundConfig.enabled}
                                                />
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() => handlePreviewSound('notification')}
                                                disabled={!audioSupported || !soundConfig.enabled || soundConfig.volume <= 0}
                                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                <Play size={15} className="fill-current" />
                                                Tester
                                            </button>
                                        </div>

                                        {localSettings.notificationMode === 'silent' && (
                                            <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                                                Le mode silencieux coupe les sons de rappel.
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-3">
                                        {SOUND_PRESETS.map((preset) => {
                                            const isSelected = soundConfig.profile === preset.id;
                                            return (
                                                <button
                                                    key={preset.id}
                                                    type="button"
                                                    onClick={() => handleSoundConfigChange({ profile: preset.id })}
                                                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${isSelected ? 'border-emerald-300/50 bg-emerald-300/10 text-white' : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'}`}
                                                >
                                                    <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                                                        {preset.name}
                                                        {isSelected && <Check size={15} className="text-emerald-300" />}
                                                    </span>
                                                    <span className="mt-1 block text-xs leading-5 text-gray-400">{preset.description}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                                        {soundTargets.map((sound, index) => {
                                            const Icon = sound.icon;
                                            const customSound = soundConfig[sound.id];
                                            return (
                                                <div key={sound.id} className={`grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${index > 0 ? 'border-t border-white/10' : ''}`}>
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-gray-300">
                                                            <Icon size={16} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-white">{sound.label}</div>
                                                            <div className="truncate text-sm text-gray-400">
                                                                {customSound ? getSoundDisplayName(customSound) : `Profil ${SOUND_PRESETS.find((preset) => preset.id === soundConfig.profile)?.name || 'Calme'}`}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-2 md:w-[260px]">
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePreviewSound(sound.id)}
                                                            disabled={!audioSupported || !soundConfig.enabled || soundConfig.volume <= 0}
                                                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 text-xs font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            <Play size={13} className="fill-current" />
                                                            Test
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSelectSound(sound.id)}
                                                            disabled={!isTauriRuntime}
                                                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-500/10 px-2 text-xs font-medium text-blue-100 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            <Upload size={13} />
                                                            Choisir
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleResetSound(sound.id)}
                                                            disabled={!customSound}
                                                            className="h-9 rounded-lg bg-white/5 px-2 text-xs font-medium text-gray-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                                                        >
                                                            Profil
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* --- AI --- */}
                            {activeTab === 'ai' && (
                                <div className="space-y-6">
                                    <div className="rounded-xl border border-white/10 bg-[#202020] p-6">
                                        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="flex min-w-0 gap-4">
                                                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${localSettings.aiEnabled !== false ? 'bg-blue-500/15 text-blue-100' : 'bg-white/5 text-gray-400'}`}>
                                                    <Cpu size={22} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="text-xl font-semibold text-white">Dexter IA</h3>
                                                        <span className={`rounded-md px-2 py-1 text-xs font-medium ${isAiConfigured() ? 'bg-emerald-400/10 text-emerald-100' : 'bg-white/5 text-gray-300'}`}>
                                                            {isAiConfigured() ? 'Connecté' : 'Build sans clé'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
                                                        L’assistant utilise automatiquement un routeur maison limité aux modèles gratuits d’OpenRouter. Aucun modèle ni clé API ne peut être saisi dans l’application.
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleChange('aiEnabled', localSettings.aiEnabled === false)}
                                                className={`inline-flex h-11 shrink-0 items-center justify-center rounded-lg px-5 text-sm font-medium transition-colors ${localSettings.aiEnabled !== false ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}
                                            >
                                                {localSettings.aiEnabled !== false ? 'Dexter actif' : 'Dexter coupé'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-6">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                            <div>
                                                <h3 className="text-lg font-semibold text-white">Utilisation réelle</h3>
                                                <p className="mt-1 text-sm text-gray-400">Compteurs locaux mis à jour après chaque réponse IA réussie.</p>
                                            </div>
                                            <div className="text-sm text-gray-400">
                                                Dernière utilisation <span className="font-medium text-gray-200">{formatUsageDate(aiUsageStats.lastRequestAt)}</span>
                                            </div>
                                        </div>

                                        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                            {[
                                                ['Requêtes', formatUsageNumber(aiUsageStats.totalRequests), 'appels IA'],
                                                ['Tokens', formatUsageNumber(aiUsageStats.totalTokens), 'total consommé'],
                                                ['Entrée', formatUsageNumber(aiUsageStats.promptTokens), 'tokens prompt'],
                                                ['Sortie', formatUsageNumber(aiUsageStats.completionTokens), 'tokens réponse'],
                                            ].map(([label, value, helper]) => (
                                                <div key={label} className="rounded-lg border border-white/10 bg-[#181818] px-4 py-3">
                                                    <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
                                                    <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
                                                    <div className="mt-1 text-xs text-gray-500">{helper}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
                                            <div className="rounded-lg border border-white/10 bg-[#181818] p-4">
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-medium text-white">Modèle le plus utilisé</div>
                                                        <div className="mt-2 break-all font-mono text-sm text-blue-100">
                                                            {mostUsedAiModel?.label || 'Aucune requête enregistrée'}
                                                        </div>
                                                    </div>
                                                    <div className="rounded-lg bg-white/[0.05] px-3 py-2 text-right">
                                                        <div className="text-lg font-semibold text-white">{formatUsageNumber(averageTokensPerRequest)}</div>
                                                        <div className="text-[11px] text-gray-500">tokens / requête</div>
                                                    </div>
                                                </div>
                                                <div className="mt-4 grid gap-2 text-xs text-gray-400 sm:grid-cols-2">
                                                    <span className="rounded-md bg-white/[0.05] px-3 py-2">
                                                        {formatUsageNumber(mostUsedAiModel?.requests)} requête{(mostUsedAiModel?.requests || 0) > 1 ? 's' : ''}
                                                    </span>
                                                    <span className="rounded-md bg-white/[0.05] px-3 py-2">
                                                        {formatUsageNumber(mostUsedAiModel?.totalTokens)} tokens
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="rounded-lg border border-white/10 bg-[#181818] p-4">
                                                <div className="text-sm font-medium text-white">Routeur</div>
                                                <div className="mt-2 font-mono text-sm text-gray-200">3 modèles gratuits dynamiques</div>
                                                <div className="mt-4 text-xs leading-5 text-gray-500">
                                                    Préférés : {FREE_MODEL_PREFERENCES.join(', ')}. Dexter complète automatiquement si l’un n’est plus disponible.
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-3">
                                        {[
                                            ['Commandes sûres', 'Création et modification d’événements avec garde-fous.'],
                                            ['Contexte Caltemp', 'Catégories, rappels, imports ICS et statistiques locales.'],
                                            ['Notes', 'Rédaction, correction et autocomplétion dans l’éditeur.'],
                                        ].map(([title, desc]) => (
                                            <div key={title} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                                                <div className="text-sm font-medium text-white">{title}</div>
                                                <p className="mt-1 text-xs leading-5 text-gray-400">{desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* --- BACKGROUND (UNSPLASH) --- */}
                            {activeTab === 'background' && (
                                <div className="space-y-5">
                                    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                                        <div className="relative aspect-[16/7] bg-[#111]">
                                            {backgroundPreviewUrl ? (
                                                <img
                                                    src={backgroundPreviewUrl}
                                                    alt=""
                                                    className={`h-full w-full object-cover transition-opacity ${localSettings.backgroundEnabled === false ? 'opacity-25 grayscale' : 'opacity-75'}`}
                                                />
                                            ) : (
                                                <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(20,184,166,0.28),transparent_30%),linear-gradient(135deg,#171717,#0b0b0b)] text-gray-500">
                                                    <ImageIcon size={34} />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                                            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                                                <div>
                                                    <h4 className="font-semibold text-white">Fond de l’app</h4>
                                                    <p className="mt-1 text-sm text-gray-300">
                                                        {localSettings.appBackground ? 'Image personnalisée prête à être appliquée.' : 'Choisissez une image locale, une URL HTTPS ou une photo Unsplash.'}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleChange('backgroundEnabled', localSettings.backgroundEnabled === false)}
                                                    disabled={!localSettings.appBackground}
                                                    className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${localSettings.backgroundEnabled !== false ? 'bg-teal-500/20 text-teal-100 hover:bg-teal-500/30' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}
                                                >
                                                    {localSettings.backgroundEnabled !== false ? 'Fond activé' : 'Fond coupé'}
                                                </button>
                                            </div>
                                        </div>

                                        {localSettings.unsplashAttribution && (
                                            <div className="border-t border-white/10 px-4 py-2 text-xs text-gray-400">
                                                Photo Unsplash : {localSettings.unsplashAttribution.name}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-2">
                                        <button
                                            type="button"
                                            onClick={handleSelectBackgroundFile}
                                            disabled={!isTauriRuntime}
                                            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45"
                                        >
                                            <Upload size={18} className="text-teal-200" />
                                            <span>
                                                <span className="block font-medium text-white">Image locale</span>
                                                <span className="text-sm text-gray-400">PNG, JPG ou WebP depuis votre ordinateur.</span>
                                            </span>
                                        </button>

                                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                                            <label className="flex items-center gap-2 text-sm font-medium text-white">
                                                <LinkIcon size={15} className="text-teal-200" />
                                                URL HTTPS
                                            </label>
                                            <div className="mt-3 flex gap-2">
                                                <input
                                                    value={backgroundUrlInput}
                                                    onChange={(event) => setBackgroundUrlInput(event.target.value)}
                                                    placeholder="https://.../image.jpg"
                                                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleApplyBackgroundUrl}
                                                    className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-500"
                                                >
                                                    Appliquer
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                            <label className="min-w-0 flex-1 space-y-2">
                                                <span className="text-sm font-medium text-white">Recherche Unsplash</span>
                                                <input
                                                    type="text"
                                                    value={unsplashQuery}
                                                    onChange={(e) => {
                                                        setUnsplashQuery(e.target.value);
                                                        setHasSearched(false);
                                                    }}
                                                    onKeyDown={(e) => e.key === 'Enter' && searchUnsplash()}
                                                    placeholder="paysage, montagne, abstrait..."
                                                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                onClick={searchUnsplash}
                                                disabled={isSearchingUnsplash}
                                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-medium text-white transition-colors hover:bg-teal-500 disabled:opacity-50"
                                            >
                                                {isSearchingUnsplash ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                Rechercher
                                            </button>
                                        </div>

                                        {unsplashError && <p className="mt-3 rounded-lg border border-red-400/10 bg-red-400/5 p-3 text-sm text-red-300">{unsplashError}</p>}
                                        {unsplashResults.length === 0 && !isSearchingUnsplash && hasSearched && !unsplashError && (
                                            <div className="mt-4 rounded-lg border border-dashed border-white/10 bg-white/[0.03] py-8 text-center">
                                                <Search className="mx-auto mb-2 h-8 w-8 text-gray-600 opacity-50" />
                                                <p className="text-sm text-gray-400">Aucun fond trouvé pour “{unsplashQuery}”.</p>
                                            </div>
                                        )}

                                        {unsplashResults.length > 0 && (
                                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                                {unsplashResults.map(img => (
                                                    <button
                                                        key={img.id}
                                                        type="button"
                                                        onClick={() => handleApplyUnsplash(img)}
                                                        className={`group relative aspect-video overflow-hidden rounded-lg border transition-colors ${localSettings.appBackground === img.urls.full ? 'border-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.3)]' : 'border-white/10 hover:border-white/30'}`}
                                                    >
                                                        <img src={img.urls.small} alt={img.alt_description || 'Fond Unsplash'} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                                                        {localSettings.appBackground === img.urls.full && (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-teal-500/20 backdrop-blur-sm">
                                                                <Check className="h-6 w-6 text-white drop-shadow-md" />
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {localSettings.appBackground && (
                                        <div className="flex justify-end border-t border-white/5 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBackgroundUrlInput('');
                                                    handleMultipleChanges({
                                                        appBackground: null,
                                                        unsplashAttribution: null,
                                                        backgroundEnabled: false,
                                                        backgroundSource: null,
                                                    });
                                                }}
                                                className="rounded-lg px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/10"
                                            >
                                                Retirer le fond
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- PRODUCTIVITY --- */}
                            {activeTab === 'productivity' && (
                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Notifications</h4>
                                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                                            <div>
                                                <div className="font-medium text-white">Notifications silencieuses</div>
                                                <div className="text-sm text-gray-400">Couper les sons et afficher un badge compteur dans la barre de titre</div>
                                            </div>
                                            <div className={`w-12 h-6 rounded-full transition-colors relative ${localSettings.notificationMode === 'silent' ? 'bg-amber-600' : 'bg-gray-600'}`} onClick={() => handleChange('notificationMode', localSettings.notificationMode === 'silent' ? 'normal' : 'silent')}>
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${localSettings.notificationMode === 'silent' ? 'left-7' : 'left-1'}`} />
                                            </div>
                                        </label>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t border-white/5">
                                        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2"><Tags size={14} /> Légende des catégories</h4>
                                        {Object.entries(categoryLegend).map(([key, meta]) => (
                                            <div key={key} className="grid grid-cols-[1fr_96px_auto] gap-3 items-center">
                                                <input
                                                    value={meta.label}
                                                    onChange={(e) => handleChange('categoryLegend', {
                                                        ...categoryLegend,
                                                        [key]: { ...meta, label: e.target.value }
                                                    })}
                                                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white"
                                                />
                                                <input
                                                    type="color"
                                                    value={meta.color}
                                                    onChange={(e) => handleChange('categoryLegend', {
                                                        ...categoryLegend,
                                                        [key]: { ...meta, color: e.target.value }
                                                    })}
                                                    className="h-10 w-full bg-white/5 border border-white/10 rounded-xl"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={!meta.custom}
                                                    onClick={() => {
                                                        const nextLegend = { ...categoryLegend };
                                                        delete nextLegend[key];
                                                        handleChange('categoryLegend', nextLegend);
                                                    }}
                                                    className="h-10 w-10 rounded-xl border border-white/10 text-white/40 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-white/40"
                                                    title={meta.custom ? 'Supprimer la catégorie' : 'Catégorie par défaut'}
                                                >
                                                    <Trash2 size={16} className="mx-auto" />
                                                </button>
                                            </div>
                                        ))}
                                        <div className="grid grid-cols-[1fr_96px_auto] gap-3 items-center rounded-xl border border-white/5 bg-white/[0.03] p-3">
                                            <input
                                                value={newCategory.label}
                                                onChange={(e) => setNewCategory(prev => ({ ...prev, label: e.target.value }))}
                                                placeholder="Nouvelle catégorie"
                                                className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/30"
                                            />
                                            <input
                                                type="color"
                                                value={newCategory.color}
                                                onChange={(e) => setNewCategory(prev => ({ ...prev, color: e.target.value }))}
                                                className="h-10 w-full bg-white/5 border border-white/10 rounded-xl"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddCategory}
                                                className="h-10 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm"
                                            >
                                                Ajouter
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t border-white/5">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Routines</h4>
                                        </div>
                                        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 space-y-2">
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                                                <input
                                                    value={newRoutine.title}
                                                    onChange={(e) => setNewRoutine(prev => ({ ...prev, title: e.target.value }))}
                                                    placeholder="Nom de la routine"
                                                    className="min-w-0 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/30"
                                                />
                                                <CustomSelect
                                                    value={newRoutine.category}
                                                    onChange={(value) => setNewRoutine(prev => ({ ...prev, category: value }))}
                                                    options={categoryOptions}
                                                    ariaLabel="Type de routine"
                                                />
                                            </div>
                                            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                                <input
                                                    type="number"
                                                    min="5"
                                                    step="5"
                                                    value={newRoutine.durationMinutes}
                                                    onChange={(e) => setNewRoutine(prev => ({ ...prev, durationMinutes: e.target.value }))}
                                                    className="min-w-0 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white"
                                                />
                                                <button onClick={handleAddRoutine} className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm text-white">Ajouter</button>
                                            </div>
                                        </div>
                                        {(localSettings.routines || []).length === 0 ? (
                                            <p className="text-sm text-white/40">Aucune routine enregistrée.</p>
                                        ) : (localSettings.routines || []).map(routine => (
                                            <div key={routine.id} className="p-3 rounded-xl bg-white/5 border border-white/5 text-sm text-white flex items-center justify-between gap-3">
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryLegend[routine.category]?.color || '#60a5fa' }} />
                                                    <span className="truncate">{routine.title}</span>
                                                </span>
                                                <span className="text-white/40 shrink-0">{routine.durationMinutes} min</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-white/5">
                                        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Sources ICS</h4>
                                        <IcsAssistantPanel
                                            categoryOptions={categoryOptions}
                                            onAddAndSyncSource={handleAddAndSyncIcsSource}
                                        />
                                        <div className="divide-y divide-white/5 rounded-xl border border-white/5 bg-white/[0.025]">
                                            {normalizeIcsSources(localSettings.icsSources || []).map(source => (
                                                <div key={source.id} className="px-3 py-2.5">
                                                    <div className="flex items-center gap-3">
                                                        <LinkIcon size={13} className="shrink-0 text-white/35" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="truncate text-sm font-medium text-white/90">{source.label}</span>
                                                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${source.enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-white/35'}`}>
                                                                    {source.enabled ? 'Actif' : 'Off'}
                                                                </span>
                                                            </div>
                                                            <div className="truncate text-[11px] text-white/35">{source.url || source.path || 'URL ICS à compléter'}</div>
                                                            {(source.lastSyncedAt || source.lastSyncMessage) && (
                                                                <div className={`mt-1 truncate text-[11px] ${source.lastSyncStatus === 'error' ? 'text-red-300/80' : 'text-emerald-300/75'}`}>
                                                                    {source.lastSyncedAt ? `Synchro ${formatUsageDate(source.lastSyncedAt)}` : 'Jamais synchronisé'}
                                                                    {source.lastSyncMessage ? ` · ${source.lastSyncMessage}` : ''}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {source.helpUrl && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openLink(source.helpUrl)}
                                                                className="shrink-0 text-[11px] font-medium text-blue-300/75 hover:text-blue-200 hover:underline"
                                                            >
                                                                Aide
                                                            </button>
                                                        )}
                                                        {source.url && (
                                                            <div className="flex shrink-0 items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleImportIcsUrl(source)}
                                                                    className="rounded-md bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-200 hover:bg-blue-500/20"
                                                                >
                                                                    Copier
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSyncIcsSource(source)}
                                                                    disabled={!source.enabled || syncingIcsSourceId === source.id}
                                                                    className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                                                >
                                                                    <RefreshCw size={11} className={syncingIcsSourceId === source.id ? 'animate-spin' : ''} />
                                                                    Actualiser
                                                                </button>
                                                                {!source.preset && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setUnsubscribeDraft({ source, preserveEvents: false })}
                                                                        disabled={syncingIcsSourceId === source.id}
                                                                        className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                                                    >
                                                                        <Trash2 size={11} />
                                                                        Retirer
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                        <input
                                                            type="checkbox"
                                                            checked={source.enabled}
                                                            disabled={syncingIcsSourceId === source.id}
                                                            onChange={(e) => handleToggleIcsSource(source, e.target.checked)}
                                                            className="shrink-0"
                                                            aria-label={`Activer ${source.label}`}
                                                        />
                                                    </div>
                                                    {unsubscribeDraft?.source?.id === source.id && (
                                                        <div className="mt-3 rounded-lg border border-red-300/15 bg-red-500/10 p-3 text-xs text-red-50">
                                                            <div className="font-medium">Se désabonner de « {source.label} » ?</div>
                                                            <p className="mt-1 text-red-100/70">
                                                                Par défaut, les événements importés par cette source seront retirés de l’agenda.
                                                            </p>
                                                            <label className="mt-3 flex items-center gap-2 text-red-50/90">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={unsubscribeDraft.preserveEvents}
                                                                    onChange={(event) => setUnsubscribeDraft(prev => ({ ...prev, preserveEvents: event.target.checked }))}
                                                                />
                                                                Conserver les événements comme événements locaux
                                                            </label>
                                                            <div className="mt-3 flex justify-end gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setUnsubscribeDraft(null)}
                                                                    className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/15"
                                                                >
                                                                    Annuler
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleRemoveIcsSource}
                                                                    disabled={syncingIcsSourceId === source.id}
                                                                    className="rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-50 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    Désabonner
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {source.needsUrl && (
                                                        <input
                                                            value={source.url || ''}
                                                            onChange={(e) => handleChange('icsSources', normalizeIcsSources(localSettings.icsSources || []).map(item => item.id === source.id ? { ...item, url: e.target.value } : item))}
                                                            placeholder="Coller l'URL ICS privée"
                                                            className="mt-2 w-full bg-black/20 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30"
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_auto]">
                                            <input
                                                value={newIcsSource.label}
                                                onChange={(e) => setNewIcsSource(prev => ({ ...prev, label: e.target.value }))}
                                                placeholder="Nom"
                                                className="min-w-0 bg-black/20 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white placeholder-white/30"
                                            />
                                            <input
                                                value={newIcsSource.url}
                                                onChange={(e) => setNewIcsSource(prev => ({ ...prev, url: e.target.value }))}
                                                placeholder="https://.../calendar.ics"
                                                className="min-w-0 bg-black/20 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white placeholder-white/30"
                                            />
                                            <button type="button" onClick={handleAddIcsSource} className="h-10 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm text-white">Ajouter</button>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 pt-4 border-t border-white/5">
                                        <button onClick={handleExportTheme} className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm">Exporter le thème JSON</button>
                                        <button onClick={handleImportTheme} className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm">Importer un thème JSON</button>
                                    </div>
                                </div>
                            )}

                            {/* --- ABOUT --- */}
                            {activeTab === 'about' && (
                                <div className="space-y-5">
                                    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                                        <div className="border-b border-white/10 bg-gradient-to-br from-cyan-300/10 via-white/[0.03] to-blue-500/10 p-5">
                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <div className="inline-flex items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-100">
                                                        <CalendarDays size={13} />
                                                        Calendrier desktop local
                                                    </div>
                                                    <h2 className="mt-4 text-3xl font-bold text-white">Caltemp</h2>
                                                    <p className="mt-2 max-w-xl text-sm leading-6 text-gray-300">
                                                        Calendrier, rappels, imports ICS, extensions et assistant Dexter dans une application pensée pour rester sur votre machine.
                                                    </p>
                                                </div>

                                                <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-right">
                                                    <div className="text-xs uppercase tracking-wider text-gray-500">Version</div>
                                                    <div className="mt-1 text-lg font-semibold text-white">{appVersion}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid gap-px bg-white/10 sm:grid-cols-2">
                                            {aboutRows.map((row) => {
                                                const RowIcon = row.icon;
                                                return (
                                                    <div key={row.label} className="flex items-center gap-3 bg-[#1e1e1e] p-4">
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-gray-300">
                                                            <RowIcon size={17} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-xs uppercase tracking-wider text-gray-500">{row.label}</div>
                                                            <div className="truncate text-sm font-medium text-white">{row.value}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-200">
                                                    <ShieldCheck size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-white">Confidentialité</h4>
                                                    <p className="mt-1 text-sm leading-6 text-gray-400">
                                                        Vos événements restent locaux. Les services externes ne sont utilisés que si vous les activez ou ouvrez explicitement un lien.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-blue-200">
                                                    <Puzzle size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-white">Extensions</h4>
                                                    <p className="mt-1 text-sm leading-6 text-gray-400">
                                                        Les plugins passent par le SDK Caltemp et les thèmes déclaratifs pour limiter les actions dangereuses.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 ${updateStatusMeta.tone}`}>
                                                    <UpdateStatusIcon size={19} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-white">Mises à jour</div>
                                                    <div className={`mt-1 text-sm ${updateStatusMeta.tone}`}>{updateStatusMeta.label}</div>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={checkForUpdates}
                                                disabled={updateStatus === 'checking'}
                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <RefreshCw size={15} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                                                Vérifier
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <button
                                            type="button"
                                            onClick={() => openLink('https://github.com/darkiifr/Caltemp')}
                                            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-white transition-colors hover:bg-white/[0.07]"
                                        >
                                            <span className="flex items-center gap-3">
                                                <Github size={17} className="text-gray-400" />
                                                Code source et versions
                                            </span>
                                            <ExternalLink size={14} className="text-gray-500" />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => openLink('https://ko-fi.com/darkiifr')}
                                            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-white transition-colors hover:bg-white/[0.07]"
                                        >
                                            <span className="flex items-center gap-3">
                                                <Coffee size={17} className="text-[#ff8a80]" />
                                                Soutenir le projet
                                            </span>
                                            <ExternalLink size={14} className="text-gray-500" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* --- EXTENSIONS --- */}
                            {activeTab === 'extensions' && (
                                <MarketplacePanel
                                    installedExtensions={installedExtensions}
                                    extensionErrors={extensionErrors}
                                    onRefreshExtensions={onRefreshExtensions}
                                    onRequestRestart={onRequestRestart}
                                />
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/5 bg-[#252525] flex justify-end gap-3">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSavingSettings}
                                className="px-6 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSavingSettings ? 'Application...' : 'Appliquer les changements'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <UpdateModal
                isOpen={showUpdateModal}
                onClose={() => setShowUpdateModal(false)}
                onInstall={handleInstallUpdate}
                updateInfo={availableUpdate}
                currentVersion={appVersion}
            />

            {icsImportDraft && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                    <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#181818] shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                            <div className="min-w-0">
                                <h3 className="text-lg font-semibold text-white">Préparer l’import ICS</h3>
                                <p className="mt-1 truncate text-sm text-white/45">
                                    {icsImportDraft.events.length} événements trouvés - {icsImportDraft.sourceLabel}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIcsImportDraft(null)}
                                className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"
                                title="Fermer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="max-h-[calc(86vh-142px)] overflow-y-auto p-5 custom-scrollbar">
                            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                                <label className="space-y-2">
                                    <span className="text-sm font-medium text-white">Catégorie globale</span>
                                    <CustomSelect
                                        value={icsImportDraft.defaultCategory}
                                        onChange={(value) => setIcsImportDraft(prev => ({ ...prev, defaultCategory: value }))}
                                        options={categoryOptions}
                                        ariaLabel="Catégorie globale pour l'import ICS"
                                    />
                                </label>
                                <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={icsImportDraft.defaultReminder}
                                        onChange={(event) => setIcsImportDraft(prev => ({ ...prev, defaultReminder: event.target.checked }))}
                                    />
                                    <span className="text-sm text-white">Activer les alertes pour ces événements</span>
                                </label>
                            </div>

                            <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
                                <div className="grid grid-cols-[minmax(0,1.3fr)_160px_120px] gap-3 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-wider text-white/40">
                                    <span>Événement</span>
                                    <span>Catégorie</span>
                                    <span>Alerte</span>
                                </div>
                                <div className="max-h-72 divide-y divide-white/5 overflow-y-auto custom-scrollbar">
                                    {icsImportDraft.events.map((event, index) => {
                                        const key = buildImportEventKey(event, index);
                                        const override = icsImportDraft.overridesById[key] || {};
                                        const category = override.category || icsImportDraft.defaultCategory;
                                        const reminder = typeof override.reminder === 'boolean'
                                            ? override.reminder
                                            : icsImportDraft.defaultReminder;

                                        return (
                                            <div key={key} className="grid grid-cols-[minmax(0,1.3fr)_160px_120px] gap-3 px-3 py-2.5">
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-medium text-white">{event.title || 'Sans titre'}</div>
                                                    <div className="truncate text-xs text-white/35">
                                                        {event.date ? new Date(event.date).toLocaleString('fr-FR') : 'Date inconnue'}
                                                    </div>
                                                </div>
                                                <CustomSelect
                                                    value={category}
                                                    onChange={(value) => updateIcsOverride(event, index, { category: value })}
                                                    options={categoryOptions}
                                                    ariaLabel={`Catégorie pour ${event.title || 'événement'}`}
                                                />
                                                <label className="flex items-center justify-center gap-2 text-sm text-white/70">
                                                    <input
                                                        type="checkbox"
                                                        checked={reminder}
                                                        onChange={(inputEvent) => updateIcsOverride(event, index, { reminder: inputEvent.target.checked })}
                                                    />
                                                    Alerte
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 border-t border-white/10 bg-[#202020] px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setIcsImportDraft(null)}
                                className="rounded-xl px-4 py-2 text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={confirmIcsImport}
                                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500"
                            >
                                Importer ces événements
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
