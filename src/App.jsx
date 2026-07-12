import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Calendar as CalendarIcon, Settings, Bot, ListTodo } from 'lucide-react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { type } from '@tauri-apps/plugin-os';
import { relaunch } from '@tauri-apps/plugin-process';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import CalendarView from "./components/CalendarView";
import EventModal from "./components/EventModal";
import SettingsModal from "./components/SettingsModal";
import RemindersModal from "./components/RemindersModal";
import Dexter from "./components/Dexter";
import Titlebar from "./components/Titlebar";
import ContextMenu from "./components/ContextMenu";
import NotificationToast from "./components/NotificationToast";
import CommandPalette from "./components/CommandPalette";
import ExtensionGalleryModal from "./components/ExtensionGalleryModal";
import "./App.css";
import { loadEvents, saveEvents, loadSettings, saveSettings } from "./services/fileManager";
import { ExtensionManager, ExtensionStore } from "./extensions";
import { clearDiscordPresence, updateDiscordPresence } from "./services/discordRpc";
import { consumeRuntimeSession, saveRuntimeSession } from "./services/runtimeSession";

import { playBubbleSound, playRingtone, playNotificationSound, configureSounds, resumeAudioContext } from "./utils/sound";
import { formatEventDate, normalizeEvent, normalizeEvents, normalizeSettings } from "./domain/events";
import { recordAiUsage } from "./domain/aiUsage";
import { applyIcsImportOptions } from "./domain/icsImport";
import { findIcsSourceByUrl, normalizeIcsSources, removeIcsSource } from "./domain/icsSources";
import { applyNotificationMarks, buildReminderNotifications, snoozeEventOccurrence } from "./domain/reminders";
import { computeReminderCheckDelay } from "./domain/reminderScheduler";
import { syncIcsSource, upsertIcsSourceEvents } from "./services/icsSync";
import { exportElementAsPdf, exportElementAsPng } from "./utils/exportView";
import { FastAverageColor } from "fast-average-color";
import { resolveBackgroundImageUrl } from "./utils/background";
import { getCompatibleWindowEffect } from "./utils/windowEffects";

function App() {
  const [events, setEvents] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('general');
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
  const [extensionActions, setExtensionActions] = useState([]);
  const [extensionGallery, setExtensionGallery] = useState(null);
  const [installedExtensions, setInstalledExtensions] = useState([]);
  const [extensionErrors, setExtensionErrors] = useState([]);
  const [calendarView, setCalendarView] = useState('month');
  const [startedAt] = useState(() => Date.now());
  const calendarExportRef = useRef(null);
  const eventsRef = useRef([]);
  const settingsRef = useRef({});
  const extensionManagerRef = useRef(null);
  const icsSyncingRef = useRef(false);
  const notifyRef = useRef(null);

  const [settings, setSettings] = useState({
    theme: 'dark',
    notifications: true,
    aiEnabled: true,
    discordRpcEnabled: false
  });
  const [previewSettings, setPreviewSettings] = useState(null);
  const currentSettings = previewSettings || settings;

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const persistSettings = useCallback(async (nextSettings) => {
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    if (window.__TAURI_INTERNALS__) {
      await saveSettings(nextSettings);
    }
  }, []);

  useEffect(() => {
    const handleAiUsage = async (event) => {
      const current = settingsRef.current || {};
      const next = normalizeSettings({
        ...current,
        aiUsageStats: recordAiUsage(current.aiUsageStats, event.detail),
      });
      settingsRef.current = next;
      setSettings(next);
      if (!window.__TAURI_INTERNALS__) return;
      try {
        await saveSettings(next);
      } catch (error) {
        console.error('Failed to save AI usage stats:', error);
      }
    };

    window.addEventListener('caltemp:ai-usage', handleAiUsage);
    return () => window.removeEventListener('caltemp:ai-usage', handleAiUsage);
  }, []);

  // Load Data
  useEffect(() => {
    async function initData() {
      try {
        const isTauriRuntime = Boolean(window.__TAURI_INTERNALS__);
        const os = isTauriRuntime ? await type() : '';
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
          discordRpcEnabled: false,
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
        const finalSettings = normalizeSettings({
          ...defaultSettings,
          ...loadedSettings,
          windowEffect: getCompatibleWindowEffect(loadedSettings?.windowEffect || defaultSettings.windowEffect, os),
        });
        const runtimeSession = isTauriRuntime ? await consumeRuntimeSession() : null;

        // Configure sounds
        configureSounds(finalSettings.soundConfig || {});

        setEvents(normalizeEvents(loadedEvents || [], finalSettings));
        setSettings(finalSettings);
        if (runtimeSession?.calendarView) {
          setCalendarView(runtimeSession.calendarView);
        }
        if (runtimeSession?.selectedDate) {
          setSelectedDate(new Date(runtimeSession.selectedDate));
        }
        if (runtimeSession?.settingsTab) {
          setSettingsInitialTab(runtimeSession.settingsTab);
          setIsSettingsOpen(true);
        }
        setIsLoaded(true);

        // Apply window effect on startup
        if (finalSettings.windowEffect) {
          invoke('set_window_effect', { effect: getCompatibleWindowEffect(finalSettings.windowEffect, os) });
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

  useEffect(() => {
    if (!currentSettings.appBackground || currentSettings.autoAccentFromBackground === false) return;
    const fac = new FastAverageColor();
    fac.getColorAsync(resolveBackgroundImageUrl(currentSettings.appBackground), { crossOrigin: 'anonymous' })
      .then(color => {
        document.documentElement.style.setProperty('--caltemp-accent', color.hex);
      })
      .catch(() => {
        document.documentElement.style.setProperty('--caltemp-accent', '#3b82f6');
    });
    return () => fac.destroy();
  }, [currentSettings.appBackground, currentSettings.autoAccentFromBackground]);

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

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const refreshExtensions = useCallback(async () => {
    const store = new ExtensionStore();
    await Promise.resolve();
    setExtensionActions([]);
    setExtensionGallery(null);
    const manager = new ExtensionManager({
      store,
      host: {
        getEvents: () => eventsRef.current,
        getSettings: () => settingsRef.current,
        createEvent: async (event) => {
          const eventToSave = normalizeEvent({
            id: event.id || Date.now().toString(),
            date: event.date || new Date().toISOString(),
            title: event.title || 'Sans titre',
            ...event,
          }, settingsRef.current);
          const updatedEvents = [...eventsRef.current, eventToSave];
          setEvents(updatedEvents);
          await saveEvents(updatedEvents);
          manager.emit('calendar:event-created', { event: eventToSave });
          return eventToSave;
        },
        updateEvent: async (event) => {
          const eventToSave = normalizeEvent(event, settingsRef.current);
          const updatedEvents = eventsRef.current.map((item) =>
            item.id === eventToSave.id ? eventToSave : item
          );
          setEvents(updatedEvents);
          await saveEvents(updatedEvents);
          manager.emit('calendar:event-updated', { event: eventToSave });
          return eventToSave;
        },
        deleteEvent: async (eventId) => {
          const updatedEvents = eventsRef.current.filter((item) => item.id !== eventId);
          setEvents(updatedEvents);
          await saveEvents(updatedEvents);
          manager.emit('calendar:event-deleted', { eventId });
        },
        notify,
        registerAction: (action) => {
          if (!action || typeof action.id !== 'string' || typeof action.label !== 'string' || typeof action.run !== 'function') {
            return () => {};
          }

          const extensionAction = {
            id: `extension-${action.id}`,
            label: action.label,
            run: action.run,
          };

          setExtensionActions((current) => [
            ...current.filter((item) => item.id !== extensionAction.id),
            extensionAction,
          ]);

          return () => {
            setExtensionActions((current) => current.filter((item) => item.id !== extensionAction.id));
          };
        },
        openGallery: (gallery) => setExtensionGallery(gallery),
      },
    });

    extensionManagerRef.current = manager;
    await manager.initialize();
    setInstalledExtensions(manager.getInstalled());
    setExtensionErrors(manager.getErrors());
    manager.emit('app:ready', { version: settingsRef.current?.version });
  }, [notify]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      refreshExtensions().catch((error) => {
        if (cancelled) return;
        console.error('Failed to initialize extensions:', error);
        setExtensionErrors([{ extensionId: 'runtime', message: error.message }]);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, refreshExtensions]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!currentSettings.discordRpcEnabled) {
      clearDiscordPresence();
      return;
    }

    const section = isSettingsOpen ? 'settings' : isDexterOpen ? 'dexter' : 'calendar';
    updateDiscordPresence({ section, view: calendarView, startedAt });
  }, [
    calendarView,
    currentSettings.discordRpcEnabled,
    isDexterOpen,
    isLoaded,
    isSettingsOpen,
    startedAt,
  ]);

  // Check for reminders dynamically to save battery when in background
  useEffect(() => {
    let timeoutId;
    let cancelled = false;

    const checkReminders = () => {
      if (cancelled) return;
      const now = new Date();
      const currentEvents = eventsRef.current;
      const notifications = buildReminderNotifications(currentEvents, now);

      for (const notification of notifications) {
        notifyRef.current?.(notification.title, notification.body, notification.type, {
          reminderItems: notification.items,
          count: notification.items?.length || 1,
        });
      }

      const marked = applyNotificationMarks(currentEvents, notifications);
      if (isLoaded && marked.changed) {
        eventsRef.current = marked.events;
        setEvents(marked.events);
        saveEvents(marked.events);
      }

      const delay = computeReminderCheckDelay({
        events: marked.events,
        now,
        hidden: document.hidden,
      });
      timeoutId = setTimeout(checkReminders, delay);
    };

    const scheduleSoon = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkReminders, document.hidden ? 30000 : 5000);
    };

    scheduleSoon();
    document.addEventListener('visibilitychange', scheduleSoon);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', scheduleSoon);
    };
  }, [isLoaded]);

  const handleAddEvent = useCallback((date) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setIsEventModalOpen(true);
  }, []);

  const handleSaveEvent = useCallback(async (newEvent) => {
    const normalizedEvent = normalizeEvent(newEvent, settings);
    const existingEvent = events.find(event => event.id === normalizedEvent.id);
    const isUpdate = Boolean(selectedEvent || existingEvent);
    const updatedEvents = isUpdate
      ? events.map(e => e.id === normalizedEvent.id ? normalizedEvent : e)
      : [...events, normalizedEvent];

    setEvents(updatedEvents);
    await saveEvents(updatedEvents);
    extensionManagerRef.current?.emit(
      isUpdate ? 'calendar:event-updated' : 'calendar:event-created',
      { event: normalizedEvent }
    );

    notify(
      'Événement enregistré',
      `${normalizedEvent.title} le ${formatEventDate(normalizedEvent.date, settings)}`,
      'success'
    );
    return updatedEvents;
  }, [events, notify, selectedEvent, settings]);

  const handleImportEvents = async (importedEvents, importOptions = {}) => {
    const sourceId = importOptions.sourceId || '';
    const preparedEvents = applyIcsImportOptions(importedEvents, {
      ...importOptions,
      preferInferredCategory: Boolean(sourceId),
    });
    const normalizedImports = normalizeEvents(preparedEvents, settings);
    const newEvents = sourceId
      ? upsertIcsSourceEvents({
          existingEvents: events,
          importedEvents: normalizedImports,
          sourceId,
          settings,
        }).events
      : (() => {
          const knownKeys = new Set(events.map(event => event.externalId || `${event.title}:${event.date}`));
          const uniqueImports = normalizedImports.filter(event => {
            const key = event.externalId || `${event.title}:${event.date}`;
            if (knownKeys.has(key)) return false;
            knownKeys.add(key);
            return true;
          });
          return [...events, ...uniqueImports];
        })();
    setEvents(newEvents);
    await saveEvents(newEvents);
    notify('Importation', `${normalizedImports.length} événements importés ou actualisés`, 'success');
  };

  const syncIcsSourceById = useCallback(async (sourceId, options = {}) => {
    const fetcher = window.__TAURI_INTERNALS__ ? tauriFetch : globalThis.fetch;
    if (typeof fetcher !== 'function') return null;
    const sources = normalizeIcsSources(settingsRef.current.icsSources || []);
    const source = options.source || sources.find(item => item.id === sourceId);
    if (!source) return null;

    const result = await syncIcsSource({
      source,
      events: eventsRef.current,
      settings: settingsRef.current,
      fetcher,
      now: options.now || new Date(),
    });

    if (!result.skipped) {
      eventsRef.current = result.events;
      setEvents(result.events);
      await saveEvents(result.events);
    }

    const sourceExists = sources.some(item => item.id === source.id);
    const nextSources = sourceExists
      ? sources.map(item => item.id === source.id ? result.source : item)
      : normalizeIcsSources([...sources, result.source]);
    const nextSettings = normalizeSettings({
      ...settingsRef.current,
      icsSources: nextSources,
    });
    await persistSettings(nextSettings);
    return result;
  }, [persistSettings]);

  const addAndSyncIcsSource = useCallback(async (source) => {
    const sources = normalizeIcsSources(settingsRef.current.icsSources || []);
    const duplicate = findIcsSourceByUrl(sources, source.url || '');
    if (duplicate) {
      return {
        duplicate: true,
        source: duplicate,
        stats: { added: 0, updated: 0, removed: 0 },
      };
    }

    const sourceToSync = {
      ...source,
      id: source.id || `custom-${Date.now()}`,
      type: 'url',
      enabled: true,
    };
    const fetcher = window.__TAURI_INTERNALS__ ? tauriFetch : globalThis.fetch;
    if (typeof fetcher !== 'function') {
      return {
        source: sourceToSync,
        stats: { added: 0, updated: 0, removed: 0 },
        error: new Error('Le moteur réseau ICS est indisponible.'),
      };
    }

    const result = await syncIcsSource({
      source: sourceToSync,
      events: eventsRef.current,
      settings: settingsRef.current,
      fetcher,
      now: new Date(),
    });

    if (result.skipped || result.error) return result;

    eventsRef.current = result.events;
    setEvents(result.events);
    await saveEvents(result.events);
    const nextSettings = normalizeSettings({
      ...settingsRef.current,
      icsSources: normalizeIcsSources([...sources, result.source]),
    });
    await persistSettings(nextSettings);
    return result;
  }, [persistSettings]);

  const toggleIcsSource = useCallback(async (sourceId, enabled) => {
    const sources = normalizeIcsSources(settingsRef.current.icsSources || []);
    const source = sources.find(item => item.id === sourceId);
    if (!source) return null;
    const nextSource = { ...source, enabled: Boolean(enabled) };
    const nextSettings = normalizeSettings({
      ...settingsRef.current,
      icsSources: sources.map(item => item.id === sourceId ? nextSource : item),
    });
    await persistSettings(nextSettings);
    if (nextSource.enabled && nextSource.url) {
      return syncIcsSourceById(sourceId, { force: true, source: nextSource });
    }
    return { source: nextSource, stats: { added: 0, updated: 0, removed: 0 }, skipped: true };
  }, [persistSettings, syncIcsSourceById]);

  const removeIcsSourceById = useCallback(async (sourceId, { preserveEvents = false } = {}) => {
    const sources = normalizeIcsSources(settingsRef.current.icsSources || []);
    const source = sources.find(item => item.id === sourceId);
    if (!source) return { removedEvents: 0, preservedEvents: 0 };

    let removedEvents = 0;
    let preservedEvents = 0;
    const nextEvents = eventsRef.current.reduce((acc, event) => {
      if (event.source === 'ics-url' && event.importSourceId === sourceId) {
        if (!preserveEvents) {
          removedEvents += 1;
          return acc;
        }
        preservedEvents += 1;
        acc.push(normalizeEvent({
          ...event,
          source: 'local',
          importSourceId: null,
          importSourceLabel: '',
          importKey: '',
        }, settingsRef.current));
        return acc;
      }
      acc.push(event);
      return acc;
    }, []);

    eventsRef.current = nextEvents;
    setEvents(nextEvents);
    await saveEvents(nextEvents);

    const nextSettings = normalizeSettings({
      ...settingsRef.current,
      icsSources: removeIcsSource(sources, sourceId),
    });
    await persistSettings(nextSettings);
    notify(
      'Source ICS',
      preserveEvents
        ? `${preservedEvents} événement(s) conservé(s) en local`
        : `${removedEvents} événement(s) supprimé(s)`,
      'success',
    );
    return { source, removedEvents, preservedEvents };
  }, [persistSettings, notify]);

  const syncDueIcsSources = useCallback(async ({ force = false } = {}) => {
    if (icsSyncingRef.current) return;
    const fetcher = window.__TAURI_INTERNALS__ ? tauriFetch : globalThis.fetch;
    if (typeof fetcher !== 'function') return;
    const sources = normalizeIcsSources(settingsRef.current.icsSources || [])
      .filter(source => source.enabled && source.type === 'url' && source.url);
    if (!sources.length) return;

    icsSyncingRef.current = true;
    try {
      const now = new Date();
      for (const source of sources) {
        const refreshMs = Math.max(5, Number(source.refreshMinutes || 15)) * 60 * 1000;
        const lastSync = source.lastSyncedAt ? new Date(source.lastSyncedAt).getTime() : 0;
        if (!force && lastSync && now.getTime() - lastSync < refreshMs) continue;
        await syncIcsSourceById(source.id, { now });
      }
    } finally {
      icsSyncingRef.current = false;
    }
  }, [syncIcsSourceById]);

  useEffect(() => {
    if (!isLoaded) return;
    syncDueIcsSources({ force: true });
    const intervalId = setInterval(() => syncDueIcsSources(), 60000);
    const handleVisibility = () => {
      if (!document.hidden) syncDueIcsSources();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isLoaded, syncDueIcsSources]);

  const handleDeleteEvent = async (eventId) => {
    const updatedEvents = events.filter(e => e.id !== eventId);
    setEvents(updatedEvents);
    await saveEvents(updatedEvents);
    extensionManagerRef.current?.emit('calendar:event-deleted', { eventId });
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

  const handleExportPng = useCallback(async () => {
    try {
      await exportElementAsPng(calendarExportRef.current, 'caltemp.png');
      notify('Export PNG', 'La vue calendrier a été exportée.', 'success');
    } catch (error) {
      console.error(error);
      notify('Export PNG', error.message || 'Impossible d’exporter la vue.', 'error');
    }
  }, [notify]);

  const handleExportPdf = useCallback(async () => {
    try {
      await exportElementAsPdf(calendarExportRef.current, 'caltemp.pdf');
      notify('Export PDF', 'La vue calendrier a été exportée.', 'success');
    } catch (error) {
      console.error(error);
      notify('Export PDF', error.message || 'Impossible d’exporter la vue.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return undefined;

    let unlisten = null;
    let cancelled = false;

    listen('caltemp-tray-action', (event) => {
      const action = event.payload;
      if (action === 'new-event') {
        handleAddEvent(new Date());
      } else if (action === 'dexter') {
        setIsDexterOpen(true);
      } else if (action === 'reminders') {
        setIsRemindersOpen(true);
      } else if (action === 'settings') {
        setSettingsInitialTab('general');
        setIsSettingsOpen(true);
      } else if (action === 'commands') {
        setIsCommandPaletteOpen(true);
      }
    }).then((cleanup) => {
      if (cancelled) cleanup();
      else unlisten = cleanup;
    }).catch((error) => {
      console.error('Impossible d’écouter les actions de la zone de notification.', error);
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleAddEvent]);

  const commandActions = useMemo(() => [
    {
      id: 'new-event',
      label: 'Créer un événement',
      run: () => handleAddEvent(new Date()),
    },
    {
      id: 'import-ics',
      label: 'Importer un fichier ICS',
      run: () => {
        setSettingsInitialTab('general');
        setIsSettingsOpen(true);
      },
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
      id: 'export-png',
      label: 'Exporter la vue en image PNG',
      run: handleExportPng,
    },
    {
      id: 'export-pdf',
      label: 'Exporter la vue en PDF',
      run: handleExportPdf,
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
    ...extensionActions,
  ], [settings, handleAddEvent, handleSaveEvent, extensionActions, handleExportPng, handleExportPdf]);

  const handleRestartApp = useCallback(async () => {
    await saveRuntimeSession({
      settingsTab: 'extensions',
      calendarView,
      selectedDate: selectedDate instanceof Date ? selectedDate.toISOString() : null,
    });
    await relaunch();
  }, [calendarView, selectedDate]);
  
  const appBgStyle = isBackgroundActive ? {
    backgroundImage: `url("${resolveBackgroundImageUrl(currentSettings.appBackground)}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  } : {};

  // Background state for the main outer div
  // If we have a window effect (vibrancy/mica), we MUST be transparent.
  // Otherwise, if background is disabled, we show solid dark.
  const isTransparent = (currentSettings.windowEffect && currentSettings.windowEffect !== 'none') || isBackgroundActive;

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
            onClick={() => { playBubbleSound(); setSettingsInitialTab('general'); setIsSettingsOpen(true); }}
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
                onOpenSettingsTab={(tab) => {
                  setSettingsInitialTab(tab || 'general');
                  setIsSettingsOpen(true);
                }}
                onExportPng={handleExportPng}
                onExportPdf={handleExportPdf}
              />
            ) : (
              <div ref={calendarExportRef} className="flex-1 flex flex-col overflow-hidden relative transition-all duration-300">
                <CalendarView
                  events={events}
                  settings={currentSettings}
                  showHolidays={currentSettings.showHolidays !== false}
                  showNamedays={currentSettings.showNamedays !== false}
                  onAddEvent={handleAddEvent}
                  onViewChange={setCalendarView}
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
        initialActiveTab={settingsInitialTab}
        onImportEvents={handleImportEvents}
        installedExtensions={installedExtensions}
        extensionErrors={extensionErrors}
        onRefreshExtensions={refreshExtensions}
        onRequestRestart={handleRestartApp}
        onSyncIcsSource={syncIcsSourceById}
        onAddAndSyncIcsSource={addAndSyncIcsSource}
        onToggleIcsSource={toggleIcsSource}
        onRemoveIcsSource={removeIcsSourceById}
        onClose={() => {
          setPreviewSettings(null);
          // Revert window effect if needed
          if (settings.windowEffect) {
            invoke('set_window_effect', { effect: getCompatibleWindowEffect(settings.windowEffect, osType) });
          }
          setIsSettingsOpen(false);
        }}
        settings={settings}
        onPreview={setPreviewSettings}
        onSave={async (newSettings) => {
          const normalizedSettings = normalizeSettings({
            ...newSettings,
            windowEffect: getCompatibleWindowEffect(newSettings.windowEffect, osType),
          });
          setSettings(normalizedSettings);
          setPreviewSettings(null);
          
          try {
            await saveSettings(normalizedSettings);
            // Re-apply window effect to ensure persistence
            if (normalizedSettings.windowEffect) {
              await invoke('set_window_effect', { effect: getCompatibleWindowEffect(normalizedSettings.windowEffect, osType) });
            }
            configureSounds(normalizedSettings.soundConfig || {});
            extensionManagerRef.current?.emit('settings:changed', { settings: normalizedSettings });
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

      <ExtensionGalleryModal
        gallery={extensionGallery}
        onClose={() => setExtensionGallery(null)}
      />

      <RemindersModal
        isOpen={isRemindersOpen}
        onClose={() => setIsRemindersOpen(false)}
        events={events}
        onDeleteEvent={handleDeleteEvent}
        settings={currentSettings}
      />

      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        visible={contextMenu.visible}
        onClose={() => setContextMenu({ ...contextMenu, visible: false })}
        onSettings={() => {
          setSettingsInitialTab('general');
          setIsSettingsOpen(true);
        }}
        onNewEvent={handleAddEvent}
        onToggleDexter={() => setIsDexterOpen(true)}
        onOpenReminders={() => setIsRemindersOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />
    </div>
    </div>
  );
}

export default App;
