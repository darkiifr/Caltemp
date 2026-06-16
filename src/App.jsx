import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
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
import CommandPalette from "./components/CommandPalette";
import MiniCalendar from "./components/MiniCalendar";
import "./App.css";
import { loadEvents, saveEvents, loadSettings, saveSettings } from "./services/fileManager";

import { playBubbleSound, playRingtone, playNotificationSound, configureSounds, resumeAudioContext } from "./utils/sound";
import { normalizeEvent, normalizeEvents, normalizeSettings } from "./domain/events";
import { applyNotificationMarks, buildReminderNotifications, snoozeEventOccurrence } from "./domain/reminders";
import { exportElementAsPdf, exportElementAsPng } from "./utils/exportView";
import { FastAverageColor } from "fast-average-color";

function App() {
  const isMiniWindow = new URLSearchParams(window.location.search).get('mini') === '1'
    || window.location.hash.includes('mini');
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
  const [silentBadgeCount, setSilentBadgeCount] = useState(0);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const calendarExportRef = useRef(null);

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
        const isTauriRuntime = Boolean(window.__TAURI_INTERNALS__);
        const os = !isMiniWindow && isTauriRuntime ? await type() : '';
        setOsType(os);

        const [loadedEvents, loadedSettings] = isTauriRuntime
          ? await Promise.all([
              loadEvents(),
              loadSettings()
            ])
          : [[], {}];

        // Determine defaults based on OS
        let defaultSettings = normalizeSettings({
          theme: 'dark',
          notifications: true,
          aiEnabled: true,
          fontSize: 16
        });

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
        const finalSettings = normalizeSettings({ ...defaultSettings, ...loadedSettings });

        // Configure sounds
        if (!isMiniWindow && finalSettings.soundConfig) {
          configureSounds(finalSettings.soundConfig);
        }

        setEvents(normalizeEvents(loadedEvents || [], finalSettings));
        setSettings(finalSettings);
        setIsLoaded(true);

        // Apply window effect on startup
        if (!isMiniWindow && finalSettings.windowEffect) {
          invoke('set_window_effect', { effect: finalSettings.windowEffect });
        }

        // Attempt to resume audio context on first user interaction
        if (!isMiniWindow) {
          const resumeAudio = () => {
            resumeAudioContext();
            window.removeEventListener('click', resumeAudio);
            window.removeEventListener('keydown', resumeAudio);
          };
          window.addEventListener('click', resumeAudio);
          window.addEventListener('keydown', resumeAudio);
        }

        // Request notification permission
        if (!isMiniWindow) {
          let permissionGranted = await isPermissionGranted();
          if (!permissionGranted) {
            const permission = await requestPermission();
            permissionGranted = permission === 'granted';
          }
        }
      } catch (error) {
        console.error("Init error:", error);
      }
    }
    initData();
  }, [isMiniWindow]);

  // Apply font size to root for rem scaling
  useEffect(() => {
    // Default to 16px if undefined
    const size = currentSettings.fontSize || 16;
    document.documentElement.style.fontSize = `${size}px`;
  }, [currentSettings.fontSize]);

  useEffect(() => {
    if (isMiniWindow) return;
    if (!currentSettings.appBackground || currentSettings.autoAccentFromBackground === false) return;
    const fac = new FastAverageColor();
    fac.getColorAsync(currentSettings.appBackground, { crossOrigin: 'anonymous' })
      .then(color => {
        document.documentElement.style.setProperty('--caltemp-accent', color.hex);
      })
      .catch(() => {
        document.documentElement.style.setProperty('--caltemp-accent', '#3b82f6');
      });
    return () => fac.destroy();
  }, [currentSettings.appBackground, currentSettings.autoAccentFromBackground, isMiniWindow]);

  // Helper for notifications
  const notify = React.useCallback(async (title, body, type = 'info', meta = {}) => {
    if (!settings.notifications) return;

    if (settings.notificationMode === 'silent' && type === 'reminder') {
      setSilentBadgeCount(count => count + (meta.count || 1));
      return;
    }

    if (type === 'reminder') {
      await playRingtone();
    } else {
      await playNotificationSound();
    }

    // Always show internal toast
    setToastNotification({ id: Date.now().toString(), title, body, type, ...meta });

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
  }, [settings.notifications, settings.notificationMode]);

  // Check for reminders dynamically to save battery when in background
  useEffect(() => {
    if (isMiniWindow) return;
    let timeoutId;
    
    const checkReminders = () => {
      const now = new Date();
      const notifications = buildReminderNotifications(events, now);

      for (const notification of notifications) {
        notify(notification.title, notification.body, notification.type, {
          reminderItems: notification.items,
          count: notification.items?.length || 1,
        });
      }

      const marked = applyNotificationMarks(events, notifications);
      if (isLoaded && marked.changed) {
        setEvents(marked.events);
        saveEvents(marked.events);
      }

      // Schedule next run: 5 seconds if visible, 60 seconds if in background
      const delay = document.hidden ? 60000 : 5000;
      timeoutId = setTimeout(checkReminders, delay);
    };

    // Initial call
    timeoutId = setTimeout(checkReminders, 5000);

    return () => clearTimeout(timeoutId);
  }, [events, isLoaded, settings, notify, isMiniWindow]);

  const handleAddEvent = useCallback((date) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setIsEventModalOpen(true);
  }, []);

  const handleSaveEvent = useCallback(async (newEvent) => {
    const normalizedEvent = normalizeEvent(newEvent, settings);
    const updatedEvents = selectedEvent
      ? events.map(e => e.id === normalizedEvent.id ? normalizedEvent : e)
      : [...events, normalizedEvent];

    setEvents(updatedEvents);
    await saveEvents(updatedEvents);

    notify(
      'Événement enregistré',
      `${normalizedEvent.title} le ${new Date(normalizedEvent.date).toLocaleDateString()}`,
      'success'
    );
  }, [events, notify, selectedEvent, settings]);

  const handleImportEvents = async (importedEvents) => {
    const knownKeys = new Set(events.map(event => event.externalId || `${event.title}:${event.date}`));
    const normalizedImports = normalizeEvents(importedEvents, settings).filter(event => {
      const key = event.externalId || `${event.title}:${event.date}`;
      if (knownKeys.has(key)) return false;
      knownKeys.add(key);
      return true;
    });
    const newEvents = [...events, ...normalizedImports];
    setEvents(newEvents);
    await saveEvents(newEvents);
    notify('Importation', `${normalizedImports.length} événements importés`, 'success');
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

  const isBackgroundActive = currentSettings.backgroundEnabled !== false && currentSettings.appBackground;

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase('fr-FR') === 'k') {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToastSnooze = async (minutesOrMode) => {
    if (!toastNotification?.reminderItems?.length) return;
    const now = new Date();
    const updatedEvents = events.map(event => {
      const item = toastNotification.reminderItems.find(reminder => reminder.event.id === event.id);
      return item ? snoozeEventOccurrence(event, item.occurrenceKey, minutesOrMode, now) : event;
    });
    setEvents(updatedEvents);
    await saveEvents(updatedEvents);
    setToastNotification(null);
  };

  const commandActions = useMemo(() => [
    {
      id: 'new-event',
      label: 'Créer un événement',
      run: () => handleAddEvent(new Date()),
    },
    {
      id: 'import-ics',
      label: 'Importer un fichier ICS',
      run: () => setIsSettingsOpen(true),
    },
    {
      id: 'toggle-silent',
      label: settings.notificationMode === 'silent' ? 'Désactiver le mode silencieux' : 'Activer le mode silencieux',
      run: async () => {
        const next = normalizeSettings({
          ...settings,
          notificationMode: settings.notificationMode === 'silent' ? 'normal' : 'silent',
        });
        setSettings(next);
        await saveSettings(next);
      },
    },
    {
      id: 'mini-calendar',
      label: 'Ouvrir le mini-calendrier',
      run: () => invoke('toggle_mini_calendar').catch(console.error),
    },
    {
      id: 'export-png',
      label: 'Exporter la vue en image PNG',
      run: () => exportElementAsPng(calendarExportRef.current, 'caltemp.png').catch(console.error),
    },
    {
      id: 'export-pdf',
      label: 'Exporter la vue en PDF',
      run: () => exportElementAsPdf(calendarExportRef.current, 'caltemp.pdf').catch(console.error),
    },
    ...((settings.routines || []).map(routine => ({
      id: `routine-${routine.id}`,
      label: `Appliquer la routine : ${routine.title}`,
      run: () => {
        const date = new Date();
        date.setHours(9, 0, 0, 0);
        handleSaveEvent({
          title: routine.title,
          date: date.toISOString(),
          category: routine.category || 'perso',
          durationMinutes: routine.durationMinutes || 60,
          reminder: true,
          recurrence: routine.recurrence || 'none',
          routineId: routine.id,
        });
      },
    }))),
  ], [settings, handleAddEvent, handleSaveEvent]);
  
  const appBgStyle = isBackgroundActive ? {
    backgroundImage: `url(${currentSettings.appBackground})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  } : {};

  // Background state for the main outer div
  // If we have a window effect (vibrancy/mica), we MUST be transparent.
  // Otherwise, if background is disabled, we show solid dark.
  const isTransparent = (currentSettings.windowEffect && currentSettings.windowEffect !== 'none') || isBackgroundActive;

  if (isMiniWindow) {
    return <MiniCalendar events={events} settings={currentSettings} />;
  }

  return (
    <div
      onContextMenu={handleContextMenu}
      className={`h-screen w-screen flex flex-col text-white overflow-hidden border border-white/10 transition-colors duration-500 ${
        isTransparent ? 'bg-transparent' : 'bg-[#0a0a0a]'
      }`}
    >
      {/* App Background Image Container */}
      {isBackgroundActive && (
        <>
          <div 
            className="fixed inset-0 z-[-1] transition-all duration-1000 bg-cover bg-center bg-no-repeat opacity-40 blur-[2px]"
            style={appBgStyle}
          />
          <div className="fixed inset-0 z-[-1] bg-black/40 backdrop-blur-[1px]" />
        </>
      )}
      
      <div className="relative z-10 flex flex-col h-full w-full">
        <Titlebar style={currentSettings.titlebarStyle || 'macos'} osType={osType} notificationBadge={silentBadgeCount} />

        <div className="flex-1 flex overflow-hidden">
        {/* Minimal Sidebar */}
        <div className="w-16 bg-[#1e1e1e]/50 backdrop-blur-md border-r border-white/5 flex flex-col items-center py-6 gap-6 z-20">
          <button
            onClick={() => playBubbleSound()}
            className="p-3 rounded-xl text-blue-200 hover:text-white transition-all shadow-lg"
            style={{ backgroundColor: 'color-mix(in srgb, var(--caltemp-accent, #3b82f6) 22%, transparent)' }}
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

        {/* Main Content & Dexter Flex Container */}
          {/* Main Content Area: Switch between Calendar and Dexter */}
          <div className={`flex-1 flex overflow-hidden relative ${
            isTransparent ? 'bg-transparent' : 'bg-gradient-to-br from-[#0a0a0a] to-[#121212]'
          }`}>
            
            {isDexterOpen ? (
              <Dexter
                isOpen={isDexterOpen}
                onClose={() => setIsDexterOpen(false)}
                settings={currentSettings}
                events={events}
                onAddEvent={handleSaveEvent}
              />
            ) : (
              <div ref={calendarExportRef} className="flex-1 flex flex-col overflow-hidden relative transition-all duration-300">
                <CalendarView
                  events={events}
                  settings={currentSettings}
                  showHolidays={currentSettings.showHolidays !== false}
                  showNamedays={currentSettings.showNamedays !== false}
                  onAddEvent={handleAddEvent}
                  onEditEvent={(event) => {
                    setSelectedEvent(event);
                    setIsEventModalOpen(true);
                  }}
                  onDeleteEvent={handleDeleteEvent}
                />
              </div>
            )}
          </div>
      </div>

      {currentSettings.unsplashAttribution && (
        <div className="absolute bottom-4 left-20 z-20">
          <span className="text-xs text-white/50 bg-black/40 px-2 py-1 rounded-md backdrop-blur-md border border-white/5 shadow-lg">
            Photo by <a href={`${currentSettings.unsplashAttribution.link}?utm_source=caltemp&utm_medium=referral`} target="_blank" rel="noreferrer" className="text-white hover:underline">{currentSettings.unsplashAttribution.name}</a> on <a href="https://unsplash.com/?utm_source=caltemp&utm_medium=referral" target="_blank" rel="noreferrer" className="text-white hover:underline">Unsplash</a>
          </span>
        </div>
      )}

      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        initialDate={selectedDate}
        initialEvent={selectedEvent}
        settings={currentSettings}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        events={events}
        osType={osType}
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
          const normalizedSettings = normalizeSettings(newSettings);
          setSettings(normalizedSettings);
          setPreviewSettings(null);
          
          try {
            await saveSettings(normalizedSettings);
            // Re-apply window effect to ensure persistence
            if (normalizedSettings.windowEffect) {
              await invoke('set_window_effect', { effect: normalizedSettings.windowEffect });
            }
            if (normalizedSettings.soundConfig) {
              configureSounds(normalizedSettings.soundConfig);
            }
          } catch (e) {
            console.error("Failed to save settings:", e);
            throw e;
          }

          setIsSettingsOpen(false);
        }}
      />

      <NotificationToast
        notification={toastNotification}
        onClose={() => setToastNotification(null)}
        onSnooze={handleToastSnooze}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        actions={commandActions}
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
    </div>
  );
}

export default App;
