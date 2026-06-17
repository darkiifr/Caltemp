import { invoke } from '@tauri-apps/api/core';

export const DISCORD_RPC_CLIENT_ID = '1516083174931824720';

const VIEW_LABELS = {
  year: 'Vue année',
  month: 'Vue mois',
  week: 'Vue semaine',
  day: 'Vue jour',
  dexter: 'Assistant Dexter',
  settings: 'Paramètres',
  marketplace: 'Extensions',
};

export function buildDiscordPresence({
  section = 'calendar',
  view = 'month',
  startedAt = Date.now(),
} = {}) {
  const state = section === 'calendar' ? VIEW_LABELS[view] || 'Calendrier' : VIEW_LABELS[section] || 'Caltemp';

  return {
    clientId: DISCORD_RPC_CLIENT_ID,
    activity: {
      details: 'Organise son calendrier',
      state,
      startTimestamp: Math.floor(startedAt / 1000),
      largeImageKey: 'caltemp',
      largeImageText: 'Caltemp',
    },
  };
}

export async function updateDiscordPresence(options) {
  const presence = buildDiscordPresence(options);
  try {
    await invoke('discord_rpc_update', { presence });
  } catch (error) {
    console.debug('Discord Rich Presence indisponible:', error);
  }
  return presence;
}

export async function clearDiscordPresence() {
  try {
    await invoke('discord_rpc_clear');
  } catch (error) {
    console.debug('Discord Rich Presence indisponible:', error);
  }
}
