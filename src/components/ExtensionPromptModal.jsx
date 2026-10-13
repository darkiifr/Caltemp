import React, { useEffect, useRef, useState } from 'react';
import { Puzzle, X } from 'lucide-react';

// One-line text input requested by a plugin through ctx.ui.prompt().
export default function ExtensionPromptModal({ prompt, onSubmit, onCancel }) {
  const [value, setValue] = useState(prompt.defaultValue || '');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-md flex items-start justify-center p-5 pt-[18vh]" onClick={onCancel}>
      <form
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[color:var(--caltemp-panel,#101010)]/95 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value);
        }}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">{prompt.title}</h2>
            {prompt.description && <p className="text-sm text-white/50 mt-1">{prompt.description}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title="Annuler"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          <input
            ref={inputRef}
            value={value}
            placeholder={prompt.placeholder}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onCancel();
            }}
            className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 pb-4">
          <span className="flex items-center gap-1.5 text-[11px] text-white/30">
            <Puzzle className="w-3 h-3" />
            {prompt.extensionName}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10">
              Annuler
            </button>
            <button type="submit" className="px-3 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white">
              {prompt.confirmLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
