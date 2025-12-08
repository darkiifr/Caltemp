import React, { useState } from 'react';
import { Search, Plus, Trash2, Settings, Bot, Download, Upload } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { exportNoteAsMarkdown, importMarkdownFile } from '../services/fileManager';

export default function Sidebar({ notes, onSelectNote, selectedNoteId, onCreateNote, onDeleteNote, onOpenSettings, onToggleDexter, settings }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, noteId: null });
    const appWindow = getCurrentWindow();

    // Close context menu on click anywhere
    React.useEffect(() => {
        const handleClick = () => setContextMenu({ ...contextMenu, visible: false });
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu]);

    const handleContextMenu = (e, noteId) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            noteId
        });
    };

    const handleExport = async () => {
        const note = notes.find(n => n.id === selectedNoteId);
        if (!note) {
            alert('Aucune note sélectionnée');
            return;
        }
        const result = await exportNoteAsMarkdown(note);
        if (result.success) {
            alert('Note exportée avec succès !');
        } else if (!result.cancelled) {
            alert('Erreur lors de l\'export : ' + result.error);
        }
    };

    const handleImport = async () => {
        const result = await importMarkdownFile();
        if (result.success) {
            onCreateNote(result.note);
            alert('Note importée avec succès !');
        } else if (!result.cancelled) {
            alert('Erreur lors de l\'import : ' + result.error);
        }
    };

    const filteredNotes = notes.filter(note =>
        note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        note.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="w-80 h-full bg-sidebar-dark/60 backdrop-blur-2xl border-r border-white/10 flex flex-col transition-colors duration-300">
            {/* Header : Window Controls & Search */}
            <div className="flex flex-col gap-1 p-4 pt-1 select-none">
                {/* Top Row: Traffic Lights + Drag Handle Spacer */}
                <div className="flex items-center">
                    {/* Traffic Lights - Only show when titlebar style is 'none' */}
                    {(!settings?.titlebarStyle || settings.titlebarStyle === 'none') && (
                        <div className="flex gap-2.5 group pl-1.5 pt-1 pr-4 z-50">
                            <button
                                onClick={(e) => { e.stopPropagation(); appWindow.close(); }}
                                className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] hover:bg-[#FF4A42] border border-black/10 flex items-center justify-center text-[8px] transition-all active:scale-95 shadow-sm cursor-pointer"
                            ></button>
                            <button
                                onClick={(e) => { e.stopPropagation(); appWindow.minimize(); }}
                                className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] hover:bg-[#FEAE1C] border border-black/10 flex items-center justify-center text-[8px] transition-all active:scale-95 shadow-sm cursor-pointer"
                            ></button>
                            <button
                                onClick={(e) => { e.stopPropagation(); appWindow.toggleMaximize(); }}
                                className="w-3.5 h-3.5 rounded-full bg-[#28C840] hover:bg-[#1EB332] border border-black/10 flex items-center justify-center text-[8px] transition-all active:scale-95 shadow-sm cursor-pointer"
                            ></button>
                        </div>
                    )}

                    {/* Drag Region: Takes remaining space in this row */}
                    <div className="flex-1 h-6" data-tauri-drag-region></div>
                </div>

                <div className="relative z-10 flex-1 group">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors duration-200" />
                    <input
                        type="text"
                        placeholder="Search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[#2C2C2E] border border-transparent focus:border-blue-500/50 pl-9 pr-3 py-2 rounded-md text-sm outline-none shadow-sm transition-all duration-200 font-medium placeholder-gray-500 text-gray-100"
                    />
                </div>
            </div>

            {/* Note List */}
            <div className="flex-1 overflow-y-auto px-3 space-y-2 py-2">
                {filteredNotes.length === 0 ? (
                    <div className="text-center text-gray-400 mt-10 text-sm font-medium animate-fade-in">No notes found</div>
                ) : (
                    filteredNotes.map((note, index) => (
                        <div
                            key={note.id}
                            onClick={() => onSelectNote(note.id)}
                            onContextMenu={(e) => handleContextMenu(e, note.id)}
                            style={{ animationDelay: `${index * 0.05}s` }}
                            className={`
                                group p-4 rounded-xl cursor-pointer transition-all duration-200 ease-out
                                flex flex-col gap-1.5 border border-transparent animate-fade-in-up
                                ${selectedNoteId === note.id
                                    ? 'bg-blue-600 text-white shadow-md scale-[1.02]'
                                    : 'hover:bg-white/10 text-white border-white/5 bg-transparent hover:scale-[1.01]'}
                            `}
                        >
                            <h3 className={`font-bold text-[15px] truncate transition-colors ${selectedNoteId === note.id ? 'text-white' : 'text-white'}`}>
                                {note.title || 'Nouvelle note'}
                            </h3>
                            <div className="flex justify-between items-baseline opacity-95">
                                <span className={`text-xs truncate max-w-[70%] font-medium transition-colors ${selectedNoteId === note.id ? 'text-blue-100' : 'text-gray-300'}`}>
                                    {note.content?.slice(0, 40) || 'Pas de contenu...'}
                                </span>
                                <span className={`text-[11px] whitespace-nowrap font-medium ${selectedNoteId === note.id ? 'text-blue-200' : 'text-gray-400'}`}>
                                    {new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Context Menu */}
            {contextMenu.visible && (
                <div
                    className="fixed z-50 w-48 bg-[#2c2c2c] border border-white/10 rounded-lg shadow-xl py-1 animate-in fade-in zoom-in-95 duration-100"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNote(contextMenu.noteId);
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        Supprimer
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const note = notes.find(n => n.id === contextMenu.noteId);
                            if (note) {
                                exportNoteAsMarkdown(note).then(res => {
                                    if (res.success) alert('Exporté !');
                                });
                            }
                            setContextMenu({ ...contextMenu, visible: false });
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10 flex items-center gap-2 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Exporter
                    </button>
                </div>
            )}

            {/* Footer Actions */}
            <div className="p-4 border-t border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md gap-2">
                <button
                    onClick={handleImport}
                    className="p-2.5 text-gray-300 hover:text-green-400 transition-all duration-200 rounded-lg hover:bg-green-900/20 active:scale-95"
                    title="Importer une note"
                >
                    <Upload className="w-5 h-5" />
                </button>

                <button
                    onClick={handleExport}
                    className="p-2.5 text-gray-300 hover:text-blue-400 transition-all duration-200 rounded-lg hover:bg-blue-900/20 active:scale-95"
                    title="Exporter la note"
                >
                    <Download className="w-5 h-5" />
                </button>

                <button
                    onClick={onOpenSettings}
                    className="p-2.5 text-gray-300 hover:text-white transition-all duration-200 rounded-lg hover:bg-white/10 active:scale-95"
                    title="Settings"
                >
                    <Settings className="w-5 h-5" />
                </button>

                {(settings?.aiEnabled !== false) && (
                    <button
                        onClick={onToggleDexter}
                        className="p-2.5 text-purple-400 hover:text-purple-300 transition-all duration-200 rounded-lg hover:bg-purple-900/30 active:scale-95"
                        title="Dexter AI"
                    >
                        <Bot className="w-5 h-5" />
                    </button>
                )}

                <div className="flex-1"></div>

                <button
                    onClick={onDeleteNote}
                    className="p-2.5 text-gray-500 hover:text-red-600 transition-all duration-200 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-95 group"
                    title="Delete Note"
                >
                    <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>

                <button
                    onClick={onCreateNote}
                    className="p-2.5 text-gray-600 dark:text-gray-300 hover:text-blue-600 transition-all duration-200 rounded-lg hover:bg-blue-100/50 dark:hover:bg-blue-900/30 active:scale-95"
                    title="New note"
                >
                    <Plus className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
}
