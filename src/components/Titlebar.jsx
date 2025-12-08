import React from 'react';
import { X, Minus, Square } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function Titlebar({ style = 'macos', osType }) {
    const appWindow = getCurrentWindow();

    if (style === 'none') return null;

    const getTitle = () => {
        if (!osType) return 'Caltemp';
        const osName = osType === 'macos' ? 'macOS' : osType.charAt(0).toUpperCase() + osType.slice(1);
        return `Caltemp on ${osName}`;
    };

    const handleClose = async (e) => {
        e.stopPropagation();
        await appWindow.close();
    };

    const handleMinimize = async (e) => {
        e.stopPropagation();
        await appWindow.minimize();
    };

    const handleMaximize = async (e) => {
        e.stopPropagation();
        await appWindow.toggleMaximize();
    };

    // macOS style: rounded buttons on the left
    if (style === 'macos') {
        return (
            <div
                data-tauri-drag-region
                className="h-10 w-full bg-[#1e1e1e]/90 backdrop-blur-md border-b border-white/5 flex items-center select-none transition-colors duration-300 px-4 justify-between relative z-50 cursor-default"
            >
                <div className="flex gap-2.5 relative z-50" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                        onClick={handleClose}
                        className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] hover:bg-[#FF4A42] border border-black/10 flex items-center justify-center transition-all active:scale-95 shadow-sm group cursor-default"
                        title="Close"
                    >
                        <X size={8} className="opacity-0 group-hover:opacity-100 text-black/50" />
                    </button>
                    <button
                        onClick={handleMinimize}
                        className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] hover:bg-[#FEAE1C] border border-black/10 flex items-center justify-center transition-all active:scale-95 shadow-sm group cursor-default"
                        title="Minimize"
                    >
                        <Minus size={8} className="opacity-0 group-hover:opacity-100 text-black/50" />
                    </button>
                    <button
                        onClick={handleMaximize}
                        className="w-3.5 h-3.5 rounded-full bg-[#28C840] hover:bg-[#1EB332] border border-black/10 flex items-center justify-center transition-all active:scale-95 shadow-sm group cursor-default"
                        title="Maximize"
                    >
                         <Square size={6} className="opacity-0 group-hover:opacity-100 text-black/50" />
                    </button>
                </div>
                <div className="text-xs font-medium text-white/30 pointer-events-none" data-tauri-drag-region>
                    {getTitle()}
                </div>
                <div className="w-16" data-tauri-drag-region></div>
            </div>
        );
    }

    // Windows style: flat buttons on the right
    if (style === 'windows') {
        return (
            <div
                data-tauri-drag-region
                className="h-8 w-full bg-[#1e1e1e]/80 backdrop-blur-md border-b border-white/10 flex items-center select-none transition-colors duration-300 relative z-50 cursor-default"
            >
                <div className="flex-1 px-4 pointer-events-none">
                    <div className="text-sm font-medium text-gray-300">{getTitle()}</div>
                </div>
                <div className="flex h-full" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                        onClick={handleMinimize}
                        className="w-12 h-full hover:bg-white/10 flex items-center justify-center transition-colors"
                        title="Minimize"
                    >
                        <Minus className="w-4 h-4 text-gray-300" />
                    </button>
                    <button
                        onClick={handleMaximize}
                        className="w-12 h-full hover:bg-white/10 flex items-center justify-center transition-colors"
                        title="Maximize"
                    >
                        <Square className="w-3.5 h-3.5 text-gray-300" />
                    </button>
                    <button
                        onClick={handleClose}
                        className="w-12 h-full hover:bg-red-600 hover:text-white flex items-center justify-center transition-colors"
                        title="Close"
                    >
                        <X className="w-4 h-4 text-gray-300 group-hover:text-white" />
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
