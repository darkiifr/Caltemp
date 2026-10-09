import React, { Suspense, lazy, useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Calendar as CalendarIcon, Settings, Bot, ListTodo, CalendarArrowDown, X } from 'lucide-react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { type } from '@tauri-apps/plugin-os';
import { relaunch } from '@tauri-apps/plugin-process';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import CalendarView from "./components/CalendarView";
import EventModal from "./components/EventModal";
import RemindersModal from "./components/RemindersModal";
import Titlebar from "./components/Titlebar";
import ContextMenu from "./components/ContextMenu";
import NotificationToast from "./components/NotificationToast";
import CommandPalette from "./components/CommandPalette";
import "./App.css";
import { loadEvents, saveEventsLatest, loadSettings, saveSettings } from "./services/fileManager";
import { ExtensionManager, ExtensionStore } from "./extensions";
import { clearDiscordPresence, updateDiscordPresence } from "./services/discordRpc";
import { consumeRuntimeSession, saveRuntimeSession } from "./services/runtimeSession";

import { playBubbleSound, playRingtone, playNotificationSound, configureSounds, resumeAudioContext } from "./utils/sound";
import { formatEventDate, normalizeEvent, normalizeEvents, normalizeSettings } from "./domain/events";
import { recordAiUsage } from "./domain/aiUsage";
import { applyIcsImportOptions, normalizeWebcalUrl } from "./domain/icsImport";
import { mergeImportedEvents } from "./domain/calendarImport";
import { addDismissedIcsKey, findIcsSourceByUrl, mergeIcsSyncState, normalizeIcsSources, removeIcsSource } from "./domain/icsSources";
import { ICS_SYNC_CONCURRENCY, computeNextIcsSyncDelay, isIcsSourceDue, mapWithConcurrency } from "./domain/icsScheduler";
import { applyNotificationMarks, buildReminderNotifications, snoozeEventOccurrence } from "./domain/reminders";
import { computeReminderCheckDelay } from "./domain/reminderScheduler";
import { applyIcsFetchResult, diffEventFields, fetchIcsSource, upsertIcsSourceEvents } from "./services/icsSync";
import { FastAverageColor } from "fast-average-color";
import { resolveBackgroundImageUrl } from "./utils/background";
import { getCompatibleWindowEffect } from "./utils/windowEffects";

// Heavy, on-demand surfaces are split out of the startup bundle: they are only
// downloaded and parsed the first time the user opens them.
const SettingsModal = lazy(() => import("./components/SettingsModal"));
const Dexter = lazy(() => import("./components/Dexter"));
const ExtensionGalleryModal = lazy(() => import("./components/ExtensionGalleryModal"));
const CalendarImportWizard = lazy(() => import("./components/CalendarImportWizard"));
const loadExportView = () => import("./utils/exportView");

function getIcsFetcher() {
  const fetcher = window.__TAURI_INTERNALS__ ? tauriFetch : globalThis.fetch;
  return typeof fetcher === 'function' ? fetcher : null;
}

function App() {
  const [events, setEvents] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Settings is lazy-loaded on first open, then kept mounted so in-flight work
  // (update download, ICS import) survives closing the panel.
  const [hasOpenedSettings, setHasOpenedSettings] = useState(false);
  if (isSettingsOpen && !hasOpenedSettings) setHasOpenedSettings(true);
  const [settingsInitialTab, setSettingsInitialTab] = useState('general');
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
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
  const icsQueueRef = useRef(Promise.resolve());
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

  // Every event mutation goes through here: the ref is updated synchronously so
  // concurrent async flows (ICS sync, reminders, extensions) always read the
  // latest list, and disk writes are coalesced.
  const commitEvents = useCallback((nextEvents) => {
    eventsRef.current = nextEvents;
    setEvents(nextEvents);
    return saveEventsLatest(nextEvents);
  }, []);

  const persistSettings = useCallback(async (nextSettings) => {
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    if (window.__TAURI_INTERNALS__) {
      await saveSettings(nextSettings);
    }
  }, []);

  const patchSettings = useCallback((patch) => persistSettings(normalizeSettings({
    ...settingsRef.current,
    ...patch,
  })).catch(error => console.error('Failed to save settings:', error)), [persistSettings]);

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

        const initialEvents = normalizeEvents(loadedEvents || [], finalSettings);
        eventsRef.current = initialEvents;
        setEvents(initialEvents);
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
          await commitEvents(updatedEvents);
          manager.emit('calendar:event-created', { event: eventToSave });
          return eventToSave;
        },
        updateEvent: async (event) => {
          const eventToSave = normalizeEvent(event, settingsRef.current);
          const updatedEvents = eventsRef.current.map((item) =>
            item.id === eventToSave.id ? eventToSave : item
          );
          await commitEvents(updatedEvents);
          manager.emit('calendar:event-updated', { event: eventToSave });
          return eventToSave;
        },
        deleteEvent: async (eventId) => {
          const updatedEvents = eventsRef.current.filter((item) => item.id !== eventId);
          await commitEvents(updatedEvents);
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
  }, [commitEvents, notify]);

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
        commitEvents(marked.events).catch(error => console.error('Failed to save reminder marks:', error));
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
  }, [commitEvents, isLoaded]);

  const handleAddEvent = useCallback((date) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setIsEventModalOpen(true);
  }, []);

  const handleSaveEvent = useCallback(async (newEvent) => {
    const currentEvents = eventsRef.current;
    const existingEvent = currentEvents.find(event => event.id === newEvent.id);
    // Editors only send the fields they show: keep everything else (source,
    // import keys, location, geo...) so subscribed events stay linked to their feed.
    let normalizedEvent = normalizeEvent(existingEvent ? { ...existingEvent, ...newEvent } : newEvent, settingsRef.current);
    if (existingEvent?.source === 'ics-url') {
      const edited = diffEventFields(existingEvent, normalizedEvent);
      if (edited.length) {
        normalizedEvent = {
          ...normalizedEvent,
          localOverrides: Array.from(new Set([...(existingEvent.localOverrides || []), ...edited])),
        };
      }
    }
    const isUpdate = Boolean(selectedEvent || existingEvent);
    const updatedEvents = existingEvent
      ? currentEvents.map(e => e.id === normalizedEvent.id ? normalizedEvent : e)
      : [...currentEvents, normalizedEvent];

    await commitEvents(updatedEvents);
    extensionManagerRef.current?.emit(
      isUpdate ? 'calendar:event-updated' : 'calendar:event-created',
      { event: normalizedEvent }
    );

    notify(
      'Événement enregistré',
      `${normalizedEvent.title} le ${formatEventDate(normalizedEvent.date, settingsRef.current)}`,
      'success'
    );
    return updatedEvents;
  }, [commitEvents, notify, selectedEvent]);

  const handleImportEvents = async (importedEvents, importOptions = {}) => {
    const sourceId = importOptions.sourceId || '';
    const preparedEvents = applyIcsImportOptions(importedEvents, {
      ...importOptions,
      preferInferredCategory: Boolean(sourceId),
    });
    const normalizedImports = normalizeEvents(preparedEvents, settings);
    const currentEvents = eventsRef.current;
    if (sourceId) {
      const newEvents = upsertIcsSourceEvents({
        existingEvents: currentEvents,
        importedEvents: normalizedImports,
        sourceId,
        settings,
      }).events;
      await commitEvents(newEvents);
      notify('Importation', `${normalizedImports.length} événements importés ou actualisés`, 'success');
      return { added: normalizedImports.length, updated: 0, skipped: 0 };
    }

    const { events: newEvents, stats } = mergeImportedEvents(currentEvents, normalizedImports, {
      allowDuplicates: Boolean(importOptions.allowDuplicates),
    });
    await commitEvents(newEvents);
    notify('Importation', `${stats.added} ajoutés, ${stats.updated} mis à jour`, 'success');
    return stats;
  };

  const openImportWizard = useCallback(() => {
    setIsSettingsOpen(false);
    setIsImportWizardOpen(true);
  }, []);

  const openIcsSubscriptions = useCallback(() => {
    setIsImportWizardOpen(false);
    setSettingsInitialTab('productivity');
    setIsSettingsOpen(true);
  }, []);

  /**
   * Single entry point for every subscription refresh (startup, timer, focus,
   * network back online, manual button, toggle, new source).
   *
   * - Runs are serialised, so two syncs never interleave.
   * - Feeds are downloaded in parallel, outside of any state snapshot.
   * - Results are merged into the *current* events and settings once the
   *   downloads are done, so edits made meanwhile are never rolled back.
   * - Unchanged feeds (HTTP 304 or same content) cost no re-render and no write.
   */
  const runIcsSync = useCallback((pickSources, { force = false, now, extraSource = null } = {}) => {
    const task = icsQueueRef.current.then(async () => {
      const fetcher = getIcsFetcher();
      const at = now || new Date();
      const known = normalizeIcsSources(settingsRef.current.icsSources || []);
      const targets = pickSources(extraSource ? [...known, extraSource] : known, at);
      if (!targets.length) return [];
      if (!fetcher) {
        return targets.map(source => ({
          source,
          status: 'error',
          stats: { added: 0, updated: 0, removed: 0 },
          error: new Error('Le moteur réseau ICS est indisponible.'),
        }));
      }

      const fetched = await mapWithConcurrency(targets, ICS_SYNC_CONCURRENCY, source => fetchIcsSource({
        source,
        events: eventsRef.current,
        settings: settingsRef.current,
        fetcher,
        now: at,
        force,
      }));

      // Merge phase: synchronous, on the latest state.
      const liveSources = normalizeIcsSources(settingsRef.current.icsSources || []);
      const liveIds = new Set(liveSources.map(source => source.id));
      let nextEvents = eventsRef.current;
      const outcomes = fetched.map((result) => {
        const stillSubscribed = liveIds.has(result.source.id) || result.source.id === extraSource?.id;
        // A source removed or disabled while it was downloading must not bring its events back.
        const liveSource = liveSources.find(source => source.id === result.source.id);
        if (!stillSubscribed || (liveSource && !liveSource.enabled && result.status === 'changed')) {
          return { ...result, skipped: true, stats: { added: 0, updated: 0, removed: 0 } };
        }
        if (result.status === 'skipped') return { ...result, skipped: true, stats: { added: 0, updated: 0, removed: 0 } };
        const applied = applyIcsFetchResult({ events: nextEvents, result, settings: settingsRef.current });
        nextEvents = applied.events;
        return { ...result, source: applied.source, stats: applied.stats, changed: applied.changed };
      });

      if (nextEvents !== eventsRef.current) await commitEvents(nextEvents);

      const synced = outcomes.filter(outcome => !outcome.skipped).map(outcome => outcome.source);
      if (synced.length) {
        const current = normalizeIcsSources(settingsRef.current.icsSources || []);
        // A new source is kept only once its first download worked.
        const newSources = outcomes
          .filter(outcome => outcome.source.id === extraSource?.id && outcome.status !== 'error' && !outcome.skipped)
          .map(outcome => outcome.source)
          .filter(source => !current.some(item => item.id === source.id));
        const nextSettings = normalizeSettings({
          ...settingsRef.current,
          icsSources: mergeIcsSyncState([...current, ...newSources], synced),
        });
        await persistSettings(nextSettings);
      }
      return outcomes;
    });
    // Keep the queue alive whatever happens to this run.
    icsQueueRef.current = task.catch((error) => console.error('ICS sync failed:', error));
    return task;
  }, [commitEvents, persistSettings]);

  const syncIcsSourceById = useCallback(async (sourceId, options = {}) => {
    const [outcome] = await runIcsSync(
      sources => {
        const source = sources.find(item => item.id === sourceId);
        if (!source) return [];
        if (!options.source) return [source];
        // The caller's copy may carry unsaved edits; its sync status may be stale.
        return [mergeIcsSyncState([{ ...source, ...options.source }], [source]).find(item => item.id === sourceId)];
      },
      { force: options.force !== false, now: options.now },
    );
    return outcome || null;
  }, [runIcsSync]);

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

    const candidate = {
      ...source,
      url: normalizeWebcalUrl(source.url),
      id: source.id || `custom-${Date.now()}`,
      type: 'url',
      enabled: true,
    };
    const sourceToSync = normalizeIcsSources([candidate]).find(item => item.id === candidate.id);

    const [outcome] = await runIcsSync(
      () => [sourceToSync],
      // A source whose first download fails is not saved: the user fixes the URL first.
      { force: true, extraSource: sourceToSync },
    );
    return outcome || { source: sourceToSync, stats: { added: 0, updated: 0, removed: 0 }, skipped: true };
  }, [runIcsSync]);

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

    await commitEvents(nextEvents);

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
  }, [commitEvents, persistSettings, notify]);

  // Background refresh: each source follows its own interval, failing sources
  // back off (1, 2, 4... minutes up to their interval), and a refresh is pulled
  // forward when the window regains focus or the network comes back.
  const syncDueIcsSources = useCallback(({ force = false } = {}) => runIcsSync(
    (sources, now) => sources.filter(source => source.enabled && source.type === 'url' && source.url
      && (force || isIcsSourceDue(source, now))),
    { force: false },
  ), [runIcsSync]);

  useEffect(() => {
    if (!isLoaded) return undefined;
    let timeoutId;
    let disposed = false;

    const schedule = () => {
      clearTimeout(timeoutId);
      if (disposed) return;
      const sources = normalizeIcsSources(settingsRef.current.icsSources || []);
      const delay = computeNextIcsSyncDelay(sources, new Date(), { hidden: document.hidden });
      timeoutId = setTimeout(tick, delay);
    };
    const tick = () => {
      if (disposed) return;
      syncDueIcsSources().finally(schedule);
    };
    const pullForward = () => {
      if (document.hidden || !navigator.onLine) return;
      clearTimeout(timeoutId);
      syncDueIcsSources().finally(schedule);
    };

    // Startup: refresh everything once, conditionally (cheap when nothing changed).
    syncDueIcsSources({ force: true }).finally(schedule);
    document.addEventListener('visibilitychange', pullForward);
    window.addEventListener('focus', pullForward);
    window.addEventListener('online', pullForward);
    return () => {
      disposed = true;
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', pullForward);
      window.removeEventListener('focus', pullForward);
      window.removeEventListener('online', pullForward);
    };
  }, [isLoaded, syncDueIcsSources]);

  const handleDeleteEvent = useCallback(async (eventId) => {
    const deleted = eventsRef.current.find(e => e.id === eventId);
    const updatedEvents = eventsRef.current.filter(e => e.id !== eventId);
    await commitEvents(updatedEvents);
    extensionManagerRef.current?.emit('calendar:event-deleted', { eventId });
    // Remember deleted subscription events, or the next refresh would bring them back.
    if (deleted?.source === 'ics-url' && deleted.importSourceId && deleted.importKey) {
      const sources = normalizeIcsSources(settingsRef.current.icsSources || []);
      if (sources.some(source => source.id === deleted.importSourceId)) {
        await persistSettings(normalizeSettings({
          ...settingsRef.current,
          icsSources: sources.map(source => source.id === deleted.importSourceId
            ? { ...source, dismissedKeys: addDismissedIcsKey(source.dismissedKeys, deleted.importKey) }
            : source),
        }));
      }
    }
  }, [commitEvents, persistSettings]);

  const handleEditEvent = useCallback((event) => {
    setSelectedEvent(event);
    setIsEventModalOpen(true);
  }, []);

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
    const updatedEvents = eventsRef.current.map(event => {
      const item = toastNotification.reminderItems.find(reminder => reminder.event.id === event.id);
      return item ? snoozeEventOccurrence(event, item.occurrenceKey, minutesOrMode, now) : event;
    });
    await commitEvents(updatedEvents);
    setToastNotification(null);
  };

  const handleExportPng = useCallback(async () => {
    try {
      const { exportElementAsPng } = await loadExportView();
      await exportElementAsPng(calendarExportRef.current, 'caltemp.png');
      notify('Export PNG', 'La vue calendrier a été exportée.', 'success');
    } catch (error) {
      console.error(error);
      notify('Export PNG', error.message || 'Impossible d’exporter la vue.', 'error');
    }
  }, [notify]);

  const handleExportPdf = useCallback(async () => {
    try {
      const { exportElementAsPdf } = await loadExportView();
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

  const importCategoryOptions = useMemo(() => Object.entries(settings.categoryLegend || {}).map(([value, meta]) => ({
    value,
    label: meta.label,
    color: meta.color,
  })), [settings.categoryLegend]);
  const showImportPrompt = isLoaded
    && events.length === 0
    && !settings.importPromptDismissed
    && !isImportWizardOpen;

  const commandActions = useMemo(() => [
    {
      id: 'new-event',
      label: 'Créer un événement',
      run: () => handleAddEvent(new Date()),
    },
    {
      id: 'import-calendar',
      label: 'Importer depuis un autre agenda (Google, Outlook, Apple, ICS, CSV)',
      run: openImportWizard,
    },
    {
      id: 'import-subscribe',
      label: 'S’abonner à un agenda en ligne (lien ICS)',
      run: openIcsSubscriptions,
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
  ], [settings, handleAddEvent, handleSaveEvent, extensionActions, handleExportPng, handleExportPdf, openImportWizard, openIcsSubscriptions]);

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
            onClick={() => { playBubbleSound(); openImportWizard(); }}
            className="p-3 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all"
            title="Importer depuis un autre agenda"
          >
            <CalendarArrowDown size={24} />
          </button>

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
              <Suspense fallback={<div className="flex-1" />}>
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
              </Suspense>
            ) : (
              <div ref={calendarExportRef} className="flex-1 flex flex-col overflow-hidden relative transition-all duration-300">
                <CalendarView
                  events={events}
                  settings={currentSettings}
                  showHolidays={currentSettings.showHolidays !== false}
                  showNamedays={currentSettings.showNamedays !== false}
                  onAddEvent={handleAddEvent}
                  onViewChange={setCalendarView}
                  onEditEvent={handleEditEvent}
                  onDeleteEvent={handleDeleteEvent}
                  onSettingsPatch={patchSettings}
                />
                {showImportPrompt && (
                  <div className="absolute bottom-5 right-5 z-20 flex max-w-sm items-start gap-3 rounded-2xl border border-white/10 bg-[#1b1b1b]/95 p-4 shadow-2xl backdrop-blur-md">
                    <div className="rounded-xl bg-blue-500/15 p-2 text-blue-300">
                      <CalendarArrowDown size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white">Vous venez d’un autre agenda ?</div>
                      <p className="mt-1 text-xs text-white/50">
                        Importez Google Agenda, Outlook, Apple ou Proton en une minute : vos événements, catégories et rappels.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={openImportWizard}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                        >
                          Importer mes événements
                        </button>
                        <button
                          type="button"
                          onClick={() => patchSettings({ importPromptDismissed: true })}
                          className="rounded-lg px-3 py-1.5 text-xs text-white/45 hover:bg-white/5 hover:text-white"
                        >
                          Plus tard
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => patchSettings({ importPromptDismissed: true })}
                      className="rounded-lg p-1 text-white/35 hover:bg-white/10 hover:text-white"
                      title="Masquer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
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
        events={events}
      />

      {hasOpenedSettings && (
      <Suspense fallback={null}>
      <SettingsModal
        isOpen={isSettingsOpen}
        events={events}
        osType={osType}
        initialActiveTab={settingsInitialTab}
        onImportEvents={handleImportEvents}
        onOpenImportWizard={openImportWizard}
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
            // The form's copy of the sources may predate the latest background syncs.
            icsSources: mergeIcsSyncState(newSettings.icsSources || [], settingsRef.current.icsSources || []),
            windowEffect: getCompatibleWindowEffect(newSettings.windowEffect, osType),
          });
          settingsRef.current = normalizedSettings;
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
      </Suspense>
      )}

      {isImportWizardOpen && (
        <Suspense fallback={null}>
          <CalendarImportWizard
            isOpen={isImportWizardOpen}
            onClose={() => setIsImportWizardOpen(false)}
            existingEvents={events}
            categoryOptions={importCategoryOptions}
            onImport={async (importedEvents, importOptions) => {
              const stats = await handleImportEvents(importedEvents, importOptions);
              if (!settingsRef.current.importPromptDismissed) patchSettings({ importPromptDismissed: true });
              return stats;
            }}
            onOpenSubscriptions={openIcsSubscriptions}
          />
        </Suspense>
      )}

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

      {extensionGallery && (
        <Suspense fallback={null}>
          <ExtensionGalleryModal
            gallery={extensionGallery}
            onClose={() => setExtensionGallery(null)}
          />
        </Suspense>
      )}

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
