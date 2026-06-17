import React, { useEffect } from 'react';
import { X, Bell, CheckCircle, AlertCircle, Info, Clock3 } from 'lucide-react';

export default function NotificationToast({ notification, onClose, onSnooze }) {
  const isReminder = notification?.type === 'reminder';

  useEffect(() => {
    if (notification && !isReminder) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, onClose, isReminder]);

  useEffect(() => {
    if (!notification) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
      if (isReminder && event.key.toLocaleLowerCase('fr-FR') === 's') {
        onSnooze?.(5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notification, isReminder, onClose, onSnooze]);

  if (!notification) return null;

  const getIcon = () => {
    switch (notification.type) {
      case 'success': return <CheckCircle size={24} className="text-green-500" />;
      case 'error': return <AlertCircle size={24} className="text-red-500" />;
      case 'reminder': return <Bell size={24} className="text-yellow-500" />;
      default: return <Info size={24} className="text-blue-500" />;
    }
  };

  return (
    <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-right fade-in duration-300">
      <div className="bg-[#1e1e1e]/90 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-2xl flex items-start gap-3 w-96">
        <div className="mt-1 shrink-0">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white text-sm">{notification.title}</h4>
          <p className="text-white/60 text-xs mt-1">{notification.body}</p>
          {isReminder && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                [5, '5 min', 'Reporter de 5 minutes'],
                [10, '10 min', 'Reporter de 10 minutes'],
                [30, '30 min', 'Reporter de 30 minutes'],
              ].map(([minutes, label, ariaLabel]) => (
                <button
                  key={minutes}
                  type="button"
                  aria-label={ariaLabel}
                  onClick={() => onSnooze?.(minutes)}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Clock3 size={12} />
                  {label}
                </button>
              ))}
              <button
                type="button"
                aria-label="Reporter à la fin de journée"
                onClick={() => onSnooze?.('endOfDay')}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-400/20 transition-colors"
              >
                Fin de journée
              </button>
            </div>
          )}
        </div>
        <button 
          onClick={onClose}
          aria-label="Fermer la notification"
          className="text-white/40 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
