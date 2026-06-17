import React, { useMemo, useState } from 'react';
import { Command, Search, BellOff, CalendarPlus, Download, Focus } from 'lucide-react';

export default function CommandPalette({ isOpen, onClose, actions = [] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const value = query.toLocaleLowerCase('fr-FR');
    return actions.filter(action => action.label.toLocaleLowerCase('fr-FR').includes(value));
  }, [actions, query]);

  if (!isOpen) return null;

  const iconFor = (id) => {
    if (id.includes('event')) return <CalendarPlus size={16} />;
    if (id.includes('export')) return <Download size={16} />;
    if (id.includes('silent')) return <BellOff size={16} />;
    if (id.includes('focus')) return <Focus size={16} />;
    return <Command size={16} />;
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-24">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#161616]/95 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search size={18} className="text-white/40" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'Enter' && filtered[0]) {
                filtered[0].run();
                onClose();
              }
            }}
            placeholder="Rechercher une commande..."
            className="flex-1 bg-transparent text-white placeholder-white/30 outline-none"
          />
          <span className="text-[10px] text-white/30 border border-white/10 rounded px-1.5 py-0.5">Ctrl K</span>
        </div>
        <div className="max-h-80 overflow-y-auto custom-scrollbar p-2">
          {filtered.map(action => (
            <button
              key={action.id}
              onClick={() => {
                action.run();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              <span className="text-white/50">{iconFor(action.id)}</span>
              <span>{action.label}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-white/30">Aucune commande trouvée.</div>
          )}
        </div>
      </div>
    </div>
  );
}
