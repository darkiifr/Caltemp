import React, { useEffect, useRef } from 'react';
import { RefreshCw, Settings, LogOut } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function ContextMenu({ x, y, visible, onClose, onSettings }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const handleReload = () => {
    window.location.reload();
    onClose();
  };

  const handleCloseApp = async () => {
    await getCurrentWindow().close();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-48 bg-[#1e1e1e]/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl py-1 text-sm text-white overflow-hidden"
      style={{ top: y, left: x }}
    >
      <button
        onClick={handleReload}
        className="w-full px-3 py-2 text-left hover:bg-white/10 flex items-center gap-2 transition-colors"
      >
        <RefreshCw size={14} className="text-white/50" />
        <span>Recharger</span>
      </button>
      
      <button
        onClick={() => {
            onSettings();
            onClose();
        }}
        className="w-full px-3 py-2 text-left hover:bg-white/10 flex items-center gap-2 transition-colors"
      >
        <Settings size={14} className="text-white/50" />
        <span>Paramètres</span>
      </button>

      <div className="h-px bg-white/10 my-1" />

      <button
        onClick={handleCloseApp}
        className="w-full px-3 py-2 text-left hover:bg-red-500/20 hover:text-red-400 flex items-center gap-2 transition-colors text-red-300"
      >
        <LogOut size={14} />
        <span>Quitter</span>
      </button>
    </div>
  );
}
