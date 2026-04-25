import React, { useState, useEffect } from 'react';
import { X, Monitor, Cpu, Info, Check, RefreshCw, Layout, Download, Upload, Coffee, Image as ImageIcon, Search } from 'lucide-react';
import { getVersion } from '@tauri-apps/plugin-app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { message, save, ask } from '@tauri-apps/plugin-dialog';
import { open as openLink } from '@tauri-apps/plugin-shell';
import UpdateModal from './UpdateModal';
import { open } from '@tauri-apps/plugin-dialog';
import { Trash2, Plus, Volume2, Music, Play } from 'lucide-react';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { playBubbleSound, playRingtone, playNotificationSound } from '../utils/sound';
import { generateICS, parseICS } from '../utils/ics';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

const DEFAULT_MODELS = [
    { id: 'mistralai/mistral-7b-instruct', name: 'Mistral 7B (Gratuit)' },
    { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
    { id: 'google/gemini-pro', name: 'Gemini Pro' },
];

export default function SettingsModal({ isOpen, onClose, settings, onSave, onPreview, events, onImportEvents, osType }) {
    const [activeTab, setActiveTab] = useState('general');
    const [appVersion, setAppVersion] = useState('Unknown');
    const [updateStatus, setUpdateStatus] = useState(null);
    const [localSettings, setLocalSettings] = useState({ ...settings, customModels: settings.customModels || [] });
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [availableUpdate, setAvailableUpdate] = useState(null);
    const [newModelInput, setNewModelInput] = useState('');
    
    // Unsplash State
    const [unsplashQuery, setUnsplashQuery] = useState('');
    const [unsplashResults, setUnsplashResults] = useState([]);
    const [isSearchingUnsplash, setIsSearchingUnsplash] = useState(false);
    const [unsplashError, setUnsplashError] = useState('');
    const [hasSearched, setHasSearched] = useState(false);

    const displayOsName = osType === 'macos' ? 'macOS' : (osType === 'linux' ? 'Linux' : 'Windows');

    useEffect(() => {
        if (isOpen) {

            setLocalSettings({ ...settings, customModels: settings.customModels || [] });

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
    }, [isOpen, settings]);

    const handleChange = (key, value) => {
        setLocalSettings(prev => {
            const newSettings = { ...prev, [key]: value };
            
            // Live preview
            if (onPreview) {
                onPreview(newSettings);
            }

            // Apply immediate effects for window style only (preview)
            if (key === 'windowEffect') {
                invoke('set_window_effect', { effect: value });
            }

            if (key === 'autoStart') {
                (async () => {
                    try {
                        if (value) await enable();
                        else await disable();
                    } catch (e) {
                        console.error('Failed to toggle autostart', e);
                    }
                })();
            }

            return newSettings;
        });
    };

    const handleMultipleChanges = (changes) => {
        setLocalSettings(prev => {
            const newSettings = { ...prev, ...changes };
            if (onPreview) onPreview(newSettings);
            return newSettings;
        });
    };

    const handleSave = () => {
        onSave(localSettings);
        // Do not call onClose here, let the parent handle it
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
                const importedEvents = parseICS(content);
                
                if (importedEvents.length === 0) {
                    await message('Aucun événement trouvé dans ce fichier.', { kind: 'warning' });
                    return;
                }

                const shouldImport = await ask(
                    `Trouvé ${importedEvents.length} événements. Voulez-vous les importer ?`,
                    { 
                        title: 'Confirmer l\'importation',
                        kind: 'info'
                    }
                );

                if (shouldImport && onImportEvents) {
                    onImportEvents(importedEvents);
                    await message('Importation réussie !', { kind: 'info', title: 'Import' });
                    onClose();
                }
            }
        } catch (e) {
            console.error(e);
            await message('Erreur lors de l\'importation: ' + e, { kind: 'error' });
        }
    };

    const checkForUpdates = async () => {
        setUpdateStatus('checking');
        try {
            const update = await check();
            if (update?.available) {
                setUpdateStatus('available');
                setAvailableUpdate(update);
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

    const handleAddCustomModel = () => {
        if (!newModelInput.trim()) return;
        const updatedModels = [...(localSettings.customModels || []), newModelInput.trim()];
        handleChange('customModels', updatedModels);
        setNewModelInput('');
    };

    const handleRemoveCustomModel = (modelToRemove) => {
        const updatedModels = (localSettings.customModels || []).filter(m => m !== modelToRemove);
        handleChange('customModels', updatedModels);
        if (localSettings.aiModel === modelToRemove) {
            handleChange('aiModel', DEFAULT_MODELS[0].id);
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
        try {
            const file = await open({
                multiple: false,
                filters: [{
                    name: 'Audio',
                    extensions: ['mp3', 'wav', 'ogg', 'm4a']
                }]
            });

            if (file) {
                const currentSoundConfig = localSettings.soundConfig || {};
                handleChange('soundConfig', {
                    ...currentSoundConfig,
                    [type]: file
                });
            }
        } catch (err) {
            console.error("Error selecting sound file:", err);
        }
    };

    const handleResetSound = (type) => {
        const currentSoundConfig = localSettings.soundConfig || {};
        const newConfig = { ...currentSoundConfig };
        delete newConfig[type]; // Remove key to revert to default
        handleChange('soundConfig', newConfig);
    };

    if (!isOpen) return null;

    const searchUnsplash = async () => {
        const activeUnsplashKey = localSettings.unsplashApiKey || import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
        if (!unsplashQuery.trim() || !activeUnsplashKey) {
            setUnsplashError("Veuillez configurer la clé API Unsplash et un terme de recherche.");
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
        const activeUnsplashKey = localSettings.unsplashApiKey || import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
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

    const tabs = [
        { id: 'general', label: 'Général', icon: Monitor },
        { id: 'appearance', label: 'Apparence', icon: Layout },
        { id: 'sounds', label: 'Sons', icon: Volume2 },
        { id: 'ai', label: 'Intelligence Artificielle', icon: Cpu },
        { id: 'background', label: 'Fond de l\'app', icon: ImageIcon },
        { id: 'about', label: 'À propos', icon: Info },
    ];

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
                <div className="bg-[#1e1e1e] w-full max-w-[800px] h-full max-h-[600px] rounded-2xl shadow-2xl border border-white/10 flex overflow-hidden animate-in zoom-in-95 duration-200">

                    {/* Sidebar */}
                    <div className="w-64 bg-[#252525] border-r border-white/5 p-4 flex flex-col gap-2">
                        <h2 className="text-xl font-bold text-white px-4 mb-6 mt-2">Paramètres</h2>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <tab.icon className="w-4 h-4" />
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
                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Fenêtre</h4>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-white">Style de la barre de titre</label>
                                            <div className="grid grid-cols-2 gap-3">
                                                {['macos', 'windows'].map(style => (
                                                    <button
                                                        key={style}
                                                        onClick={() => handleChange('titlebarStyle', style)}
                                                        className={`p-3 rounded-xl border text-sm font-medium transition-all ${localSettings.titlebarStyle === style ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                                                    >
                                                        {style === 'macos' ? 'MacOS' : 'Windows'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-white">Effet de transparence</label>
                                            <div className="grid grid-cols-4 gap-2">
                                                {['none', 'blur', 'acrylic', 'mica'].map(effect => (
                                                    <button
                                                        key={effect}
                                                        onClick={() => handleChange('windowEffect', effect)}
                                                        className={`p-3 rounded-xl border text-sm font-medium transition-all ${localSettings.windowEffect === effect ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                                                    >
                                                        {effect === 'none' ? 'Normal' : effect.charAt(0).toUpperCase() + effect.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-xs text-gray-500">Certains effets ne sont disponibles que sur Windows 11.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Typographie</h4>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-white">Taille de la police</label>
                                            <div className="grid grid-cols-3 gap-3">
                                                {[
                                                    { label: 'Petite', value: 14 },
                                                    { label: 'Moyenne', value: 16 },
                                                    { label: 'Grande', value: 20 }
                                                ].map(size => (
                                                    <button
                                                        key={size.value}
                                                        onClick={() => handleChange('fontSize', size.value)}
                                                        className={`p-3 rounded-xl border text-sm font-medium transition-all ${localSettings.fontSize === size.value ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                                                    >
                                                        {size.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- SOUNDS --- */}
                            {activeTab === 'sounds' && (
                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Personnalisation sonore</h4>

                                        {[
                                            { id: 'bubble', label: 'Son de clic (Bubble)', desc: "Joué lors des interactions simples" },
                                            { id: 'notification', label: 'Notification', desc: "Joué lors de l'enregistrement d'un événement" },
                                            { id: 'ringtone', label: 'Sonnerie', desc: "Joué pour les rappels d'événements" }
                                        ].map(sound => (
                                            <div key={sound.id} className="p-4 bg-white/5 rounded-xl border border-white/5">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                if (sound.id === 'bubble') playBubbleSound();
                                                                else if (sound.id === 'ringtone') playRingtone();
                                                                else if (sound.id === 'notification') playNotificationSound();
                                                            }}
                                                            className="p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-full transition-colors"
                                                            title="Tester le son"
                                                        >
                                                            <Play size={10} className="fill-current" />
                                                        </button>
                                                        <div>
                                                            <div className="font-medium text-white">{sound.label}</div>
                                                            <div className="text-sm text-gray-400">{sound.desc}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {(localSettings.soundConfig && localSettings.soundConfig[sound.id]) && (
                                                            <button
                                                                onClick={() => handleResetSound(sound.id)}
                                                                className="px-3 py-1.5 text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                                                            >
                                                                Rétablir défaut
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleSelectSound(sound.id)}
                                                            className="px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors flex items-center gap-1"
                                                        >
                                                            <Music size={12} />
                                                            Choisir un fichier
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 px-3 py-2 bg-black/20 rounded-lg border border-white/5">
                                                    <Music size={14} className="text-gray-500" />
                                                    <div className="text-xs text-gray-300 truncate font-mono flex-1">
                                                        {(localSettings.soundConfig && localSettings.soundConfig[sound.id])
                                                            ? localSettings.soundConfig[sound.id]
                                                            : 'Son par défaut (Généré)'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* --- AI --- */}
                            {activeTab === 'ai' && (
                                <div className="space-y-6">
                                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                        <div className="flex gap-3">
                                            <Cpu className="w-5 h-5 text-blue-400 shrink-0" />
                                            <div>
                                                <h4 className="font-medium text-blue-400">Assistant Dexter</h4>
                                                <p className="text-sm text-blue-300/70 mt-1">
                                                    Configurez l&apos;IA pour obtenir de l&apos;aide sur vos événements et notes.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-white">Clé API OpenRouter</label>
                                            <input
                                                type="password"
                                                value={localSettings.aiApiKey || ''}
                                                onChange={(e) => handleChange('aiApiKey', e.target.value)}
                                                placeholder="sk-or-..."
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                            />
                                            <p className="text-xs text-gray-500">
                                                Obtenez une clé sur <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">openrouter.ai</a>
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-white">Modèle IA</label>
                                            <div className="relative">
                                                <select
                                                    value={localSettings.aiModel || DEFAULT_MODELS[0].id}
                                                    onChange={(e) => handleChange('aiModel', e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer"
                                                    style={{ colorScheme: 'dark' }}
                                                >
                                                    <optgroup label="Modèles par défaut" className="bg-[#1e1e1e] text-white">
                                                        {DEFAULT_MODELS.map(model => (
                                                            <option key={model.id} value={model.id} className="bg-[#1e1e1e] text-white py-2">{model.name}</option>
                                                        ))}
                                                    </optgroup>
                                                    {(localSettings.customModels || []).length > 0 && (
                                                        <optgroup label="Modèles personnalisés" className="bg-[#1e1e1e] text-white">
                                                            {(localSettings.customModels || []).map(model => (
                                                                <option key={model} value={model} className="bg-[#1e1e1e] text-white py-2">{model}</option>
                                                            ))}
                                                        </optgroup>
                                                    )}
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                Sélectionnez le modèle à utiliser avec votre clé API.
                                            </p>
                                        </div>

                                        <div className="space-y-2 pt-4 border-t border-white/5">
                                            <label className="text-sm font-medium text-white">Ajouter un modèle personnalisé</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={newModelInput}
                                                    onChange={(e) => setNewModelInput(e.target.value)}
                                                    placeholder="ex: meta-llama/llama-3-70b-instruct"
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                                />
                                                <button
                                                    onClick={handleAddCustomModel}
                                                    disabled={!newModelInput.trim()}
                                                    className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-xl transition-colors"
                                                >
                                                    <Plus size={20} />
                                                </button>
                                            </div>

                                            {(localSettings.customModels || []).length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {localSettings.customModels.map(model => (
                                                        <div key={model} className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg text-sm text-gray-300 border border-white/5">
                                                            <span className="truncate max-w-[200px]">{model}</span>
                                                            <button
                                                                onClick={() => handleRemoveCustomModel(model)}
                                                                className="text-gray-500 hover:text-red-400 transition-colors"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- BACKGROUND (UNSPLASH) --- */}
                            {activeTab === 'background' && (
                                <div className="space-y-6">
                                    <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                                        <div className="flex gap-3">
                                            <ImageIcon className="w-5 h-5 text-teal-400 shrink-0" />
                                            <div>
                                                <h4 className="font-medium text-teal-400">Fonds d&apos;écran Unsplash</h4>
                                                <p className="text-sm text-teal-300/70 mt-1">
                                                    Recherchez et appliquez de magnifiques images en fond pour sublimer votre calendrier.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                                        <div>
                                            <h4 className="font-medium text-white">Activer le fond d&apos;écran</h4>
                                            <p className="text-xs text-gray-400">Afficher une image Unsplash ou une couleur personnalisée</p>
                                        </div>
                                        <div 
                                            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${localSettings.backgroundEnabled !== false ? 'bg-teal-600' : 'bg-gray-600'}`} 
                                            onClick={() => handleChange('backgroundEnabled', localSettings.backgroundEnabled === false)}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${localSettings.backgroundEnabled !== false ? 'left-7' : 'left-1'}`} />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {!(import.meta.env.VITE_UNSPLASH_ACCESS_KEY) && (
                                            <div className="space-y-2 text-left">
                                                <label className="text-sm font-medium text-white">Clé API Unsplash (Obligatoire)</label>
                                                <input
                                                    type="password"
                                                    value={localSettings.unsplashApiKey || ''}
                                                    onChange={(e) => handleChange('unsplashApiKey', e.target.value)}
                                                    placeholder="Access Key..."
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
                                                />
                                                <div className="text-xs text-gray-500">
                                                    <ol className="list-decimal ml-4 mt-2 mb-1 space-y-1">
                                                        <li>Inscrivez-vous gratuitement sur <a href="https://unsplash.com/developers" target="_blank" rel="noreferrer" className="text-teal-400 hover:underline">Unsplash Developers</a>.</li>
                                                        <li>Cliquez sur <strong>New Application</strong>.</li>
                                                        <li>Acceptez les conditions, nommez votre app, et copiez la clé indiquée sous <strong>Access Key</strong>.</li>
                                                    </ol>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-white">Rechercher une image</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={unsplashQuery}
                                                    onChange={(e) => {
                                                        setUnsplashQuery(e.target.value);
                                                        setHasSearched(false);
                                                    }}
                                                    onKeyDown={(e) => e.key === 'Enter' && searchUnsplash()}
                                                    placeholder="paysage, montagne, abstrait..."
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
                                                />
                                                <button
                                                    onClick={searchUnsplash}
                                                    disabled={isSearchingUnsplash}
                                                    className="px-4 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-xl transition-colors flex items-center gap-2"
                                                >
                                                    {isSearchingUnsplash ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            {unsplashError && <p className="text-sm text-red-400 mt-2 bg-red-400/5 p-3 rounded-lg border border-red-400/10">{unsplashError}</p>}
                                            {unsplashResults.length === 0 && !isSearchingUnsplash && hasSearched && !unsplashError && (
                                                <div className="text-center py-10 bg-white/5 rounded-xl border border-dashed border-white/10 mt-4">
                                                    <Search className="w-8 h-8 text-gray-600 mx-auto mb-2 opacity-50" />
                                                    <p className="text-gray-400 text-sm">Aucun fond d&apos;écran trouvé pour &quot;{unsplashQuery}&quot;</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-4 grid grid-cols-3 gap-3">
                                            {unsplashResults.map(img => (
                                                <button
                                                    key={img.id}
                                                    onClick={() => handleApplyUnsplash(img)}
                                                    className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all group ${localSettings.appBackground === img.urls.full ? 'border-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.3)]' : 'border-transparent hover:border-white/20'}`}
                                                >
                                                    <img src={img.urls.small} alt={img.alt_description} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                                                    {localSettings.appBackground === img.urls.full && (
                                                        <div className="absolute inset-0 bg-teal-500/20 flex items-center justify-center backdrop-blur-sm">
                                                            <Check className="w-6 h-6 text-white drop-shadow-md" />
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>

                                        {localSettings.appBackground && (
                                            <div className="pt-4 border-t border-white/5 flex justify-end">
                                                <button
                                                    onClick={() => {
                                                        handleMultipleChanges({
                                                            appBackground: null,
                                                            unsplashAttribution: null,
                                                            backgroundEnabled: false
                                                        });
                                                    }}
                                                    className="px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                                                >
                                                    Retirer le fond d&apos;écran
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* --- ABOUT --- */}
                            {activeTab === 'about' && (
                                <div className="text-center space-y-6 py-8">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white">Caltemp</h2>
                                        <p className="text-gray-400">Version {appVersion}</p>
                                    </div>

                                    <div className="flex justify-center gap-4">
                                        <button
                                            onClick={checkForUpdates}
                                            disabled={updateStatus === 'checking'}
                                            className="flex items-center gap-2 px-6 py-2 bg-white/5 hover:bg-white/10 rounded-full text-sm font-medium transition-colors"
                                        >
                                            {updateStatus === 'checking' ? (
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <RefreshCw className="w-4 h-4" />
                                            )}
                                            Vérifier les mises à jour
                                        </button>
                                    </div>

                                    {updateStatus === 'uptodate' && (
                                        <p className="text-green-400 text-sm flex items-center justify-center gap-2">
                                            <Check className="w-4 h-4" />
                                            Caltemp est à jour
                                        </p>
                                    )}
                                </div>
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
                                className="px-6 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 transition-all"
                            >
                                Appliquer les changements
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
        </>
    );
}
