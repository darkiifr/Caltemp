import React, { useState, useEffect } from "react";
import { Calendar as CalendarIcon, Settings, Bot, Bell } from 'lucide-react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';
import { type } from '@tauri-apps/plugin-os';
import CalendarView from "./components/CalendarView";
import EventModal from "./components/EventModal";
import SettingsModal from "./components/SettingsModal";
import Dexter from "./components/Dexter";
import Titlebar from "./components/Titlebar";
import ContextMenu from "./components/ContextMenu";
import "./App.css";
import { loadEvents, saveEvents, loadSettings, saveSettings } from "./services/fileManager";

function App() {
  const [events, setEvents] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDexterOpen, setIsDexterOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [osType, setOsType] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  
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

        setEvents(loadedEvents || []);
        setSettings(finalSettings);
        setIsLoaded(true);
        
        // Apply window effect on startup
        if (finalSettings.windowEffect) {
             invoke('set_window_effect', { effect: finalSettings.windowEffect });
        }

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

  // Check for reminders every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const updatedEvents = events.map(event => {
        if (event.reminder && !event.notified) {
          const eventDate = new Date(event.date);
          const timeDiff = eventDate - now;
          
          // Notify 15 minutes before (or at time if missed)
          if (timeDiff > 0 && timeDiff <= 15 * 60 * 1000) {
             sendNotification({
                title: 'Rappel Caltemp',
                body: `Bientôt : ${event.title}`,
             });
             return { ...event, notified: true };
          }
        }
        return event;
      });

      // Only update state if changes occurred to avoid infinite loops
      if (isLoaded && JSON.stringify(updatedEvents) !== JSON.stringify(events)) {
          setEvents(updatedEvents);
          saveEvents(updatedEvents); // Persist notification state
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [events, isLoaded]);

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
    
    if (settings.notifications) {
        sendNotification({
            title: 'Événement enregistré',
            body: `${newEvent.title} le ${new Date(newEvent.date).toLocaleDateString()}`
        });
    }
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
      className={`h-screen w-screen flex flex-col text-white overflow-hidden border border-white/10 ${
        (!currentSettings.windowEffect || currentSettings.windowEffect !== 'none') ? 'bg-transparent' : 'bg-[#121212]'
      }`}
      style={{ fontSize: `${currentSettings.fontSize || 16}px` }}
    >
      <Titlebar style={currentSettings.titlebarStyle || 'macos'} osType={osType} />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Minimal Sidebar */}
        <div className="w-16 bg-[#1e1e1e]/50 backdrop-blur-md border-r border-white/5 flex flex-col items-center py-6 gap-6 z-20">
            <button className="p-3 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white transition-all shadow-lg shadow-blue-500/10">
                <CalendarIcon size={24} />
            </button>
            
            <div className="flex-1" />
            
            <button 
                onClick={() => setIsDexterOpen(!isDexterOpen)}
                className={`p-3 rounded-xl transition-all ${isDexterOpen ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'hover:bg-white/10 text-white/50 hover:text-white'}`}
            >
                <Bot size={24} />
            </button>
            
            <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-3 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all"
            >
                <Settings size={24} />
            </button>
        </div>

        {/* Main Content */}
        <div className={`flex-1 relative ${
            (!currentSettings.windowEffect || currentSettings.windowEffect !== 'none')
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
        initialDate={selectedDate}
        initialEvent={selectedEvent}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
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
            await saveSettings(newSettings);
        }}
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
