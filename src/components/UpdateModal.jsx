import React from 'react';
import { X, Download, ArrowRight } from 'lucide-react';

export default function UpdateModal({ isOpen, onClose, onInstall, updateInfo, currentVersion }) {
    if (!isOpen || !updateInfo) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#1e1e1e] w-[500px] rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-start justify-between">
                    <div className="flex gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                            <Download size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Mise à jour disponible</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                                <span>v{currentVersion}</span>
                                <ArrowRight size={14} />
                                <span className="text-green-400 font-medium">v{updateInfo.version}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[300px] overflow-y-auto custom-scrollbar">
                    <h4 className="text-sm font-medium text-gray-300 mb-3">Nouveautés</h4>
                    <div className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed font-mono bg-black/20 p-3 rounded-lg border border-white/5">
                        {updateInfo.body || "Aucune note de version disponible."}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-[#252525] border-t border-white/5 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Ignorer
                    </button>
                    <button 
                        onClick={onInstall}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2"
                    >
                        <Download size={16} />
                        Installer maintenant
                    </button>
                </div>
            </div>
        </div>
    );
}
