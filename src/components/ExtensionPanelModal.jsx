import React, { useState } from 'react';
import { Puzzle, X } from 'lucide-react';

const BUTTON_VARIANTS = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white',
  danger: 'bg-red-500/15 hover:bg-red-500/25 text-red-200',
  default: 'bg-white/[0.06] hover:bg-white/10 text-white/80',
};

// Panels come from sandboxed plugins: content is plain text (React escapes
// it), images are HTTPS only and clicks call back into the plugin.
function PanelBlock({ block, onAction, busy }) {
  switch (block.type) {
    case 'heading':
      return <h3 className="text-sm font-semibold text-white">{block.text}</h3>;
    case 'text':
      return <p className="text-sm text-white/70 whitespace-pre-wrap">{block.text}</p>;
    case 'divider':
      return <hr className="border-white/10" />;
    case 'image':
      return <img src={block.url} alt={block.alt} className="max-h-72 rounded-xl border border-white/10 object-contain" />;
    case 'stats':
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {block.items.map((item, index) => (
            <div key={index} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-white/40">{item.label}</p>
              <p className="text-lg font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      );
    case 'progress':
      return (
        <div className="space-y-1.5">
          {block.label && <p className="text-xs text-white/60">{block.label}</p>}
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-[var(--caltemp-accent,#3b82f6)]" style={{ width: `${Math.round(block.value * 100)}%` }} />
          </div>
        </div>
      );
    case 'list':
      return (
        <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.03]">
          {block.items.map((item, index) => {
            const content = (
              <>
                {item.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{item.title}</span>
                  {item.subtitle && <span className="block truncate text-xs text-white/45">{item.subtitle}</span>}
                </span>
                {item.meta && <span className="shrink-0 text-xs text-white/40">{item.meta}</span>}
              </>
            );
            return (
              <li key={index}>
                {item.onClick ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(item.onClick)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.05] disabled:opacity-60"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      );
    case 'actions':
      return (
        <div className="flex flex-wrap gap-2">
          {block.items.map((item, index) => (
            <button
              key={index}
              type="button"
              disabled={busy}
              onClick={() => onAction(item.onClick)}
              className={`rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 ${BUTTON_VARIANTS[item.variant] || BUTTON_VARIANTS.default}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export default function ExtensionPanelModal({ panel, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!panel) return null;

  const runAction = async (callback) => {
    setBusy(true);
    setError('');
    try {
      await callback();
    } catch (err) {
      setError(err?.message || 'L’action de l’extension a échoué.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-md flex items-center justify-center p-5" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[86vh] overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--caltemp-panel,#101010)]/95 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{panel.title}</h2>
            {panel.description && <p className="text-sm text-white/50 mt-1">{panel.description}</p>}
            <p className="flex items-center gap-1.5 text-[11px] text-white/30 mt-2">
              <Puzzle className="w-3 h-3" />
              {panel.extensionName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[calc(86vh-100px)] overflow-y-auto custom-scrollbar p-5 space-y-4">
          {panel.blocks.map((block, index) => (
            <PanelBlock key={index} block={block} onAction={runAction} busy={busy} />
          ))}
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
