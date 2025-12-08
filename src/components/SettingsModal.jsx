import React, { useState, useEffect } from 'react';
import { X, Monitor, Cpu, Info, Check, RefreshCw, Layout, Type } from 'lucide-react';
import { getVersion } from '@tauri-apps/plugin-app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';
import UpdateModal from './UpdateModal';
import { getYearDetails } from '../utils/holidays';
import { Trash2, Plus } from 'lucide-react';

const DEFAULT_MODELS = [
    { id: 'mistralai/mistral-7b-instruct', name: 'Mistral 7B (Gratuit)' },
    { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
    { id: 'google/gemini-pro', name: 'Gemini Pro' },
];

export default function SettingsModal({ isOpen, onClose, settings, onSave, onPreview }) {
    const [activeTab, setActiveTab] = useState('general');
    const [appVersion, setAppVersion] = useState('Unknown');
    const [updateStatus, setUpdateStatus] = useState(null);
    const [localSettings, setLocalSettings] = useState({ ...settings, customModels: settings.customModels || [] });
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [availableUpdate, setAvailableUpdate] = useState(null);
    const [newModelInput, setNewModelInput] = useState('');
    const yearDetails = getYearDetails(new Date().getFullYear());

    useEffect(() => {
        if (isOpen) {
            setLocalSettings({ ...settings, customModels: settings.customModels || [] });
            getVersion()
                .then(ver => {
                    console.log('App version:', ver);
                    setAppVersion(ver);
                })
                .catch(err => {
                    console.error('Failed to get version:', err);
                    setAppVersion('Unknown');
                });
        }
    }, [isOpen, settings]);

    const handleChange = (key, value) => {
        const newSettings = { ...localSettings, [key]: value };
        setLocalSettings(newSettings);
        
        // Live preview
        if (onPreview) {
            onPreview(newSettings);
        }
        
        // Apply immediate effects for window style only (preview)
        if (key === 'windowEffect') {
            invoke('set_window_effect', { effect: value });
        }
    };

    const handleSave = () => {
        onSave(localSettings);
        onClose();
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
        try {
            await availableUpdate.downloadAndInstall();
            await relaunch();
        } catch (error) {
            console.error("Update failed:", error);
            setUpdateStatus('error');
        }
    };

    if (!isOpen) return null;

    const tabs = [
        { id: 'general', label: 'Général', icon: Monitor },
        { id: 'appearance', label: 'Apparence', icon: Layout },
        { id: 'ai', label: 'Intelligence Artificielle', icon: Cpu },
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
                                            <div className="text-sm text-gray-400">Lancer Caltemp au démarrage de Windows</div>
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

                        {/* --- AI --- */}
                        {activeTab === 'ai' && (
                            <div className="space-y-6">
                                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                    <div className="flex gap-3">
                                        <Cpu className="w-5 h-5 text-blue-400 shrink-0" />
                                        <div>
                                            <h4 className="font-medium text-blue-400">Assistant Dexter</h4>
                                            <p className="text-sm text-blue-300/70 mt-1">
                                                Configurez l'IA pour obtenir de l'aide sur vos événements et notes.
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
                                                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
