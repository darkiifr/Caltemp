import React, { useEffect, useRef } from 'react';
import { Bot, CalendarPlus, Command, ListTodo, RefreshCw, Settings, LogOut } from 'lucide-react';
import { exit } from '@tauri-apps/plugin-process';

const MENU_WIDTH = 232;
const MENU_HEIGHT = 292;
const VIEWPORT_MARGIN = 8;

function clampMenuPosition(x, y) {
  if (typeof window === 'undefined') return { left: x, top: y };
  return {
    left: Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)),
    top: Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - MENU_HEIGHT - VIEWPORT_MARGIN)),
  };
}

export default function ContextMenu({
  x,
  y,
  visible,
  onClose,
  onSettings,
  onNewEvent,
  onToggleDexter,
  onOpenReminders,
  onOpenCommandPalette,
}) {
  const menuRef = useRef(null);
  const position = clampMenuPosition(x, y);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const handleReload = () => {
    window.location.reload();
    onClose();
  };

  const handleCloseApp = async () => {
    await exit(0);
    onClose();
  };

  const runAction = (action) => {
    action?.();
    onClose();
  };

  const itemClass = "w-full px-3 py-2.5 text-left hover:bg-white/10 focus:bg-white/10 focus:outline-none flex items-center gap-2.5 transition-colors";

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Menu Caltemp"
      className="fixed z-50 w-[232px] overflow-hidden rounded-xl border border-white/10 bg-[#181818]/95 py-1.5 text-sm text-white shadow-2xl shadow-black/50 backdrop-blur-xl"
      style={{ top: position.top, left: position.left }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(() => onNewEvent?.(new Date()))}
        className={itemClass}
      >
        <CalendarPlus size={15} className="text-blue-200/80" />
        <span>Nouvel événement</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(onToggleDexter)}
        className={itemClass}
      >
        <Bot size={15} className="text-purple-200/80" />
        <span>Ouvrir Dexter</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(onOpenReminders)}
        className={itemClass}
      >
        <ListTodo size={15} className="text-emerald-200/80" />
        <span>Tous les événements</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(onOpenCommandPalette)}
        className={itemClass}
      >
        <Command size={15} className="text-white/50" />
        <span>Palette de commandes</span>
      </button>

      <div className="my-1 h-px bg-white/10" />

      <button
        type="button"
        role="menuitem"
        onClick={handleReload}
        className={itemClass}
      >
        <RefreshCw size={15} className="text-white/50" />
        <span>Recharger</span>
      </button>
      
      <button
        type="button"
        role="menuitem"
        onClick={() => {
            onSettings();
            onClose();
        }}
        className={itemClass}
      >
        <Settings size={15} className="text-white/50" />
        <span>Paramètres</span>
      </button>

      <div className="my-1 h-px bg-white/10" />

      <button
        type="button"
        role="menuitem"
        onClick={handleCloseApp}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-red-200 transition-colors hover:bg-red-500/15 hover:text-red-100 focus:bg-red-500/15 focus:outline-none"
      >
        <LogOut size={15} />
        <span>Quitter</span>
      </button>
    </div>
  );
}
