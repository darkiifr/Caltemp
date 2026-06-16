import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function CustomSelect({ value, options, onChange, ariaLabel, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = useMemo(() => options.find(option => option.value === value) || options[0], [options, value]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        className="w-full min-h-11 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-white outline-none transition-colors hover:bg-white/[0.09] focus:ring-2 focus:ring-blue-500/50 flex items-center justify-between gap-3"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />}
          {selected?.icon && <span className="shrink-0 text-white/50">{selected.icon}</span>}
          <span className="truncate">{selected?.label || 'Sélectionner'}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[90] max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#151515] p-1 shadow-2xl custom-scrollbar">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                option.value === value ? 'bg-white/12 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'
              }`}
            >
              {option.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />}
              {option.icon && <span className="shrink-0 text-white/50">{option.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.value === value && <Check size={14} className="shrink-0 text-blue-300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
