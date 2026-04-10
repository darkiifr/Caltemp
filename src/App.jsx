import React, { useState, useEffect } from "react";
import { Calendar as CalendarIcon, Settings, Bot, ListTodo } from 'lucide-react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { type } from '@tauri-apps/plugin-os';
import CalendarView from "./components/CalendarView";
import EventModal from "./components/EventModal";
import SettingsModal from "./components/SettingsModal";
import RemindersModal from "./components/RemindersModal";
import Dexter from "./components/Dexter";
import Titlebar from "./components/Titlebar";
import ContextMenu from "./components/ContextMenu";
import NotificationToast from "./components/NotificationToast";
import "./App.css";
import { loadEvents, saveEvents, loadSettings, saveSettings } from "./services/fileManager";

import { playBubbleSound, playRingtone, playNotificationSound, configureSounds, resumeAudioContext } from "./utils/sound";
import { getNextOccurrence } from "./utils/eventUtils";

function App() {
  const [events, setEvents] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDexterOpen, setIsDexterOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [osType, setOsType] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [toastNotification, setToastNotification] = useState(null);

  const [settings, setSettings] = useState({
    theme: 'dark',
    notifications: true,
    aiEnabled: true
  });
  const [previewSettings, setPreviewSettings] = useState(null);
  const currentSettings = previewSettings || settings;

  // Load Data
  useEffect(() => {
    async function initData() {
      try {
        const os = await type();
        setOsType(os);

        const [loadedEvents, loadedSettings] = await Promise.all([
          loadEvents(),
          loadSettings()
        ]);

        // Determine defaults based on OS
        let defaultSettings = {
          theme: 'dark',
          notifications: true,
          aiEnabled: true,
          fontSize: 16
        };

        if (os === 'macos') {
          defaultSettings.titlebarStyle = 'macos';
          defaultSettings.windowEffect = 'none';
        } else if (os === 'windows') {
          defaultSettings.titlebarStyle = 'windows';
          defaultSettings.windowEffect = 'mica';
        } else if (os === 'linux') {
          defaultSettings.titlebarStyle = 'windows';
          defaultSettings.windowEffect = 'none';
        }

        // Merge: loadedSettings overrides defaults
        // If loadedSettings is empty (first run), defaults will be used.
        // If loadedSettings has some keys, they override defaults.
        // We merge defaults first, then loadedSettings.
        const finalSettings = { ...defaultSettings, ...loadedSettings };

        // Configure sounds
        if (finalSettings.soundConfig) {
          configureSounds(finalSettings.soundConfig);
        }

        setEvents(loadedEvents || []);
        setSettings(finalSettings);
        setIsLoaded(true);

        // Apply window effect on startup
        if (finalSettings.windowEffect) {
          invoke('set_window_effect', { effect: finalSettings.windowEffect });
        }

        // Attempt to resume audio context on first user interaction
        const resumeAudio = () => {
          resumeAudioContext();
          window.removeEventListener('click', resumeAudio);
          window.removeEventListener('keydown', resumeAudio);
        };
        window.addEventListener('click', resumeAudio);
        window.addEventListener('keydown', resumeAudio);

        // Request notification permission
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === 'granted';
        }
      } catch (error) {
        console.error("Init error:", error);
      }
    }
    initData();
  }, []);

  // Apply font size to root for rem scaling
  useEffect(() => {
    // Default to 16px if undefined
    const size = currentSettings.fontSize || 16;
    document.documentElement.style.fontSize = `${size}px`;
  }, [currentSettings.fontSize]);

  // Helper for notifications
  const notify = React.useCallback(async (title, body, type = 'info') => {
    if (!settings.notifications) return;

    if (type === 'reminder') {
      await playRingtone();
    } else {
      await playNotificationSound();
    }

    // Always show internal toast
    setToastNotification({ title, body, type });

    try {
        sendNotification({ title, body });
    } catch (e) {
        console.error("Failed to send native notification:", e);
    }

    // Handle background / minimized state
    if (!document.hasFocus()) {
       try {
          const appWindow = getCurrentWindow();
          await appWindow.unminimize();
          await appWindow.setFocus();
       } catch (e) {
          console.error("Failed to focus window:", e);
          // Fallback to system notification if focus fails 
          // (user asked not to use PowerShell, but if we can't focus, we might miss it completely. 
          // However, user was emphatic about 'le logiciel'. Let's trust the sound + unminimize focus)
       }
    }
  }, [settings.notifications]);

  // Check for reminders every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const updatedEvents = events.map(event => {
        if (event.reminder) {
          // Allow catching occurrences that happened up to 5 minutes ago
          const checkFromDate = new Date(now.getTime() - 5 * 60 * 1000);
          const occ = getNextOccurrence(event, checkFromDate);
          
          if (!occ) return event;

          const timeDiff = occ - now;
          const occKey = occ.getTime().toString();
          
          const isFinalNotified = event.notifiedOccurrences && event.notifiedOccurrences[occKey] === 'final';
          const isEarlyNotified = event.notifiedOccurrences && event.notifiedOccurrences[occKey] === 'early';

          // If fully notified for this occurrence, do nothing
          if (isFinalNotified) return event;

          // Phase 2: Final / At Time (within 5 mins late)
          if (timeDiff <= 0 && timeDiff > -5 * 60 * 1000) {
             notify('Rappel Caltemp', `Maintenant : ${event.title}`, 'reminder');
             return { 
                 ...event, 
                 notifiedOccurrences: { ...(event.notifiedOccurrences || {}), [occKey]: 'final' } 
             };
          }

          // Phase 1: Early (within 15 mins)
          if (!isEarlyNotified && !isFinalNotified && timeDiff > 0 && timeDiff <= 15 * 60 * 1000) {
             notify('Rappel Caltemp', `Bientôt : ${event.title}`, 'reminder');
             return { 
                 ...event, 
                 notifiedOccurrences: { ...(event.notifiedOccurrences || {}), [occKey]: 'early' } 
             };
          }
        }
        return event;
      });

      // Only update state if changes occurred to avoid infinite loops
      if (isLoaded && JSON.stringify(updatedEvents) !== JSON.stringify(events)) {
        setEvents(updatedEvents);
        saveEvents(updatedEvents); // Persist notification state
      }
    }, 5000); // Check every 5 seconds for precision
    return () => clearInterval(interval);
  }, [events, isLoaded, settings, notify]); // Added settings dependency

  const handleAddEvent = (date) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = async (newEvent) => {
    const updatedEvents = selectedEvent
      ? events.map(e => e.id === newEvent.id ? newEvent : e)
      : [...events, newEvent];

    setEvents(updatedEvents);
    await saveEvents(updatedEvents);

    notify(
      'Événement enregistré',
      `${newEvent.title} le ${new Date(newEvent.date).toLocaleDateString()}`,
      'success'
    );
  };

  const handleImportEvents = async (importedEvents) => {
    const newEvents = [...events, ...importedEvents];
    setEvents(newEvents);
    await saveEvents(newEvents);
    notify('Importation', `${importedEvents.length} événements importés`, 'success');
  };

  const handleDeleteEvent = async (eventId) => {
    const updatedEvents = events.filter(e => e.id !== eventId);
    setEvents(updatedEvents);
    await saveEvents(updatedEvents);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY
    });
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      className={`h-screen w-screen flex flex-col text-white overflow-hidden border border-white/10 ${(!currentSettings.windowEffect || currentSettings.windowEffect !== 'none') ? 'bg-transparent' : 'bg-[#121212]'
        }`}
    >
      <Titlebar style={currentSettings.titlebarStyle || 'macos'} osType={osType} />

      <div className="flex-1 flex overflow-hidden">
        {/* Minimal Sidebar */}
        <div className="w-16 bg-[#1e1e1e]/50 backdrop-blur-md border-r border-white/5 flex flex-col items-center py-6 gap-6 z-20">
          <button
            onClick={() => playBubbleSound()}
            className="p-3 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white transition-all shadow-lg shadow-blue-500/10"
          >
            <CalendarIcon size={24} />
          </button>

          <div className="flex-1" />

          <button
            onClick={() => { playBubbleSound(); setIsDexterOpen(!isDexterOpen); }}
            className={`p-3 rounded-xl transition-all ${isDexterOpen ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'hover:bg-white/10 text-white/50 hover:text-white'}`}
            title="Assistant Dexter"
          >
            <Bot size={24} />
          </button>

          <button
            onClick={() => { playBubbleSound(); setIsRemindersOpen(true); }}
            className="p-3 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all"
            title="Tous les événements"
          >
            <ListTodo size={24} />
          </button>

          <button
            onClick={() => { playBubbleSound(); setIsSettingsOpen(true); }}
            className="p-3 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all"
          >
            <Settings size={24} />
          </button>
        </div>

        {/* Main Content */}
        <div className={`flex-1 relative ${(!currentSettings.windowEffect || currentSettings.windowEffect !== 'none')
          ? 'bg-transparent'
          : 'bg-gradient-to-br from-[#121212] to-[#1a1a1a]'
          }`}>
          <CalendarView
            events={events}
            showHolidays={currentSettings.showHolidays !== false}
            showNamedays={currentSettings.showNamedays !== false}
            onAddEvent={handleAddEvent}
            onEditEvent={(event) => {
              setSelectedEvent(event);
              setIsEventModalOpen(true);
            }}
            onDeleteEvent={handleDeleteEvent}
          />

          {/* Dexter Panel (Overlay) */}
          {isDexterOpen && (
            <Dexter
              isOpen={isDexterOpen}
              onClose={() => setIsDexterOpen(false)}
              settings={currentSettings}
              onAddEvent={handleSaveEvent}
            />
          )}
        </div>
      </div>

      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        initialDate={selectedDate}
        initialEvent={selectedEvent}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        events={events}
        onImportEvents={handleImportEvents}
        onClose={() => {
          setPreviewSettings(null);
          // Revert window effect if needed
          if (settings.windowEffect) {
            invoke('set_window_effect', { effect: settings.windowEffect });
          }
          setIsSettingsOpen(false);
        }}
        settings={settings}
        onPreview={setPreviewSettings}
        onSave={async (newSettings) => {
          setSettings(newSettings);
          setPreviewSettings(null);
          
          try {
            await saveSettings(newSettings);
            // Re-apply window effect to ensure persistence
            if (newSettings.windowEffect) {
              await invoke('set_window_effect', { effect: newSettings.windowEffect });
            }
            if (newSettings.soundConfig) {
              configureSounds(newSettings.soundConfig);
            }
          } catch (e) {
            console.error("Failed to save settings:", e);
          }

          setIsSettingsOpen(false);
        }}
      />

      <NotificationToast
        notification={toastNotification}
        onClose={() => setToastNotification(null)}
      />

      <RemindersModal
        isOpen={isRemindersOpen}
        onClose={() => setIsRemindersOpen(false)}
        events={events}
        onDeleteEvent={handleDeleteEvent}
      />

      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        visible={contextMenu.visible}
        onClose={() => setContextMenu({ ...contextMenu, visible: false })}
        onSettings={() => setIsSettingsOpen(true)}
      />
    </div>
  );
}

export default App;
