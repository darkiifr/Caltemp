import React, { useEffect } from 'react';
import { X, Bell, CheckCircle, AlertCircle, Info } from 'lucide-react';

export default function NotificationToast({ notification, onClose }) {
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, onClose]);

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
      <div className="bg-[#1e1e1e]/90 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-2xl flex items-start gap-3 w-80">
        <div className="mt-1 shrink-0">
          {getIcon()}
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-white text-sm">{notification.title}</h4>
          <p className="text-white/60 text-xs mt-1">{notification.body}</p>
        </div>
        <button 
          onClick={onClose}
          className="text-white/40 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
